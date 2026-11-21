import ExpoModulesCore
import Foundation
import StoreKit
import UIKit

// MARK: - Errors

/// Machine-readable failures: the message is "<code>: <text>".
private enum StoreFailure: LocalizedError {
  case unavailable
  case unverified

  var errorDescription: String? {
    switch self {
    case .unavailable: return "store-unavailable: This subscription is not available right now."
    case .unverified: return "store-unverified: The purchase could not be verified."
    }
  }
}

// MARK: - Helpers

private func storePeriodName(_ period: StoreKit.Product.SubscriptionPeriod) -> String {
  switch period.unit {
  case .day: return period.value == 7 ? "week" : ""
  case .week: return period.value == 1 ? "week" : ""
  case .month: return period.value == 1 ? "month" : ""
  case .year: return period.value == 1 ? "year" : ""
  @unknown default: return ""
  }
}

private func storePeriodDays(_ period: StoreKit.Product.SubscriptionPeriod) -> Int {
  switch period.unit {
  case .day: return period.value
  case .week: return period.value * 7
  case .month: return period.value * 30
  case .year: return period.value * 365
  @unknown default: return 0
  }
}

private func storeProductPayload(_ product: StoreKit.Product) async -> [String: Any] {
  var period = ""
  var hasTrial = false
  var trialDays = 0
  if let subscription = product.subscription {
    period = storePeriodName(subscription.subscriptionPeriod)
    // A free trial is shown only to people who can still get it (new subscribers).
    if let offer = subscription.introductoryOffer, offer.paymentMode == .freeTrial,
       await subscription.isEligibleForIntroOffer {
      hasTrial = true
      trialDays = storePeriodDays(offer.period) * max(offer.periodCount, 1)
    }
  }
  return [
    "id": product.id,
    "displayName": product.displayName,
    "displayPrice": product.displayPrice,
    // Numeric price and its currency, so the app can compare plans (e.g. the
    // yearly saving) without parsing the localised display string.
    "price": NSDecimalNumber(decimal: product.price).doubleValue,
    "currencyCode": product.priceFormatStyle.currencyCode,
    "priceLocale": product.priceFormatStyle.locale.identifier,
    "period": period,
    "hasTrial": hasTrial,
    "trialDays": trialDays,
  ]
}

/// True when Apple reports the transaction's subscription group in the
/// billing grace period: a renewal failed, but the subscriber keeps access
/// while Apple retries. The billing retry period (access lost) does not count.
/// Used only for an otherwise current entitlement whose expiry has passed.
private func storeInGracePeriod(_ transaction: StoreKit.Transaction) async -> Bool {
  guard let groupID = transaction.subscriptionGroupID else { return false }
  guard let statuses = try? await StoreKit.Product.SubscriptionInfo.status(for: groupID) else {
    return false
  }
  for status in statuses {
    guard case .verified(_) = status.transaction else { continue }
    if status.state == .inGracePeriod { return true }
  }
  return false
}

private func storeEntitlementPayload() async -> [String: Any] {
  var bestId: String? = nil
  var bestExpiry: Date? = nil
  var found = false

  for await result in StoreKit.Transaction.currentEntitlements {
    guard case .verified(let transaction) = result else { continue }
    guard transaction.revocationDate == nil else { continue }
    guard transaction.productType == .autoRenewable else { continue }
    if transaction.isUpgraded { continue }

    let expiry = transaction.expirationDate
    if let expiry = expiry, expiry <= Date() {
      // Expired, unless Apple's billing grace period still grants access.
      let inGrace = await storeInGracePeriod(transaction)
      if !inGrace { continue }
    }

    if !found {
      found = true
      bestId = transaction.productID
      bestExpiry = expiry
    } else if let expiry = expiry, let current = bestExpiry, expiry > current {
      bestId = transaction.productID
      bestExpiry = expiry
    }
  }

  var payload: [String: Any] = [
    "active": found,
    "productId": NSNull(),
    "expires": NSNull(),
  ]
  if let bestId = bestId {
    payload["productId"] = bestId
  }
  if let bestExpiry = bestExpiry {
    payload["expires"] = (bestExpiry.timeIntervalSince1970 * 1000).rounded()
  }
  return payload
}

/// The App Store-signed JWS of the active subscription, for the Vidora cloud
/// worker to verify (it checks Apple's signature chain itself). Picks the
/// same transaction as `storeEntitlementPayload`: verified, not revoked, not
/// upgraded, not expired (or in the billing grace period), latest expiry.
/// Null when there is no subscription. The worker rejects an expired JWS,
/// so a grace-period proof is refused there until Apple renews.
private func storeSubscriptionProof() async -> [String: Any] {
  var best: (jws: String, transaction: StoreKit.Transaction)? = nil

  for await result in StoreKit.Transaction.currentEntitlements {
    guard case .verified(let transaction) = result else { continue }
    guard transaction.revocationDate == nil else { continue }
    guard transaction.productType == .autoRenewable else { continue }
    if transaction.isUpgraded { continue }
    if let expiry = transaction.expirationDate, expiry <= Date() {
      // Same grace-period rule as storeEntitlementPayload.
      let inGrace = await storeInGracePeriod(transaction)
      if !inGrace { continue }
    }

    if let current = best {
      if let expiry = transaction.expirationDate,
         let currentExpiry = current.transaction.expirationDate,
         expiry > currentExpiry {
        best = (result.jwsRepresentation, transaction)
      }
    } else {
      best = (result.jwsRepresentation, transaction)
    }
  }

  guard let best = best else {
    return [
      "jws": NSNull(),
      "productId": NSNull(),
      "originalTransactionId": NSNull(),
      "expires": NSNull(),
    ]
  }
  var payload: [String: Any] = [
    "jws": best.jws,
    "productId": best.transaction.productID,
    "originalTransactionId": String(best.transaction.originalID),
    "expires": NSNull(),
  ]
  if let expiry = best.transaction.expirationDate {
    payload["expires"] = (expiry.timeIntervalSince1970 * 1000).rounded()
  }
  return payload
}

@MainActor
private func storeShowManageSubscriptions() async throws {
  let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
  guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
    return
  }
  try await AppStore.showManageSubscriptions(in: scene)
}

// MARK: - Module

public class KareviaStoreModule: Module {
  private var updatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("KareviaStore")

    Events("onEntitlementChange")

    OnCreate {
      self.updatesTask?.cancel()
      self.updatesTask = Task.detached { [weak self] in
        for await result in StoreKit.Transaction.updates {
          if Task.isCancelled { break }
          if case .verified(let transaction) = result {
            await transaction.finish()
          }
          let payload = await storeEntitlementPayload()
          var body: [String: Any?] = [:]
          for (key, value) in payload {
            body[key] = value
          }
          self?.sendEvent("onEntitlementChange", body)
        }
      }
    }

    OnDestroy {
      self.updatesTask?.cancel()
      self.updatesTask = nil
    }

    AsyncFunction("products") { (ids: [String]) async throws -> [[String: Any]] in
      let loaded = try await StoreKit.Product.products(for: Set(ids))
      var byId: [String: StoreKit.Product] = [:]
      for product in loaded where product.type == .autoRenewable {
        byId[product.id] = product
      }
      var seen = Set<String>()
      var output: [[String: Any]] = []
      for id in ids {
        guard !seen.contains(id), let product = byId[id] else { continue }
        seen.insert(id)
        output.append(await storeProductPayload(product))
      }
      return output
    }

    AsyncFunction("purchase") { (id: String) async throws -> [String: Any] in
      let loaded: [StoreKit.Product]
      do {
        loaded = try await StoreKit.Product.products(for: [id])
      } catch {
        throw StoreFailure.unavailable
      }
      guard let product = loaded.first(where: { $0.id == id }) else {
        throw StoreFailure.unavailable
      }

      // StoreFailure thrown inside the do block matches none of the catches
      // below and reaches JS unchanged; any other error is rethrown as before.
      do {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
          switch verification {
          case .verified(let transaction):
            await transaction.finish()
            return ["status": "purchased"]
          case .unverified:
            throw StoreFailure.unverified
          }
        case .userCancelled:
          return ["status": "cancelled"]
        case .pending:
          // Ask to Buy: a parent must approve; Transaction.updates delivers it.
          return ["status": "pending"]
        @unknown default:
          return ["status": "cancelled"]
        }
      } catch StoreKitError.userCancelled {
        // The user dismissed the App Store sign-in sheet.
        return ["status": "cancelled"]
      } catch StoreKitError.networkError(_) {
        throw StoreFailure.unavailable
      } catch StoreKitError.notAvailableInStorefront {
        throw StoreFailure.unavailable
      } catch is StoreKit.Product.PurchaseError {
        // Purchases not allowed (Screen Time), product unavailable, offer errors.
        throw StoreFailure.unavailable
      }
    }

    AsyncFunction("entitlement") { () async -> [String: Any] in
      return await storeEntitlementPayload()
    }

    AsyncFunction("restore") { () async throws -> [String: Any] in
      do {
        try await AppStore.sync()
      } catch StoreKitError.userCancelled {
        // The user dismissed the sign-in prompt: report what we already have.
      }
      return await storeEntitlementPayload()
    }

    /// { jws, productId, originalTransactionId, expires } or nulls; used as
    /// the bearer token for the Vidora cloud worker (AI Sahne).
    AsyncFunction("subscriptionProof") { () async -> [String: Any] in
      return await storeSubscriptionProof()
    }

    AsyncFunction("manage") { () async throws -> Void in
      try await storeShowManageSubscriptions()
    }
  }
}
