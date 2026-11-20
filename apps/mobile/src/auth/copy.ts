/**
 * Account copy (all app languages). The error table is docs/giris/ux.md
 * section 2 verbatim, except the password length, which plan.md fixes at 8.
 * Firebase codes never reach the screen: everything goes through ErrorCase.
 */
import type { AuthErrorCode } from "./firebase-rest.ts";
import type { Lang } from "../i18n/lang.ts";

export type { Lang };
type Pair = Readonly<Record<Lang, string>>;

export type ErrorCase =
  | "invalidEmail"
  | "badCredentials"
  | "emailInUse"
  | "weakPassword"
  | "tooManyAttempts"
  | "network"
  | "appleFailed"
  | "generic";

/** Where the message is shown: under the email field, the password field, or under the button. */
export type ErrorField = "email" | "password" | "form";

export const ERROR_TEXT: Readonly<Record<ErrorCase, Pair>> = {
  invalidEmail: {
    tr: "Geçerli bir e-posta yaz, örnek: ad@site.com.",
    en: "Enter a valid email, like name@site.com.",
    de: "Gib eine gültige E-Mail-Adresse ein, z. B. name@site.com.",
    es: "Escribe un correo válido, por ejemplo nombre@sitio.com.",
    fr: "Saisis un e-mail valide, par exemple nom@site.com.",
    "pt-BR": "Digite um e-mail válido, por exemplo nome@site.com.",
    it: "Inserisci un'email valida, ad esempio nome@sito.com.",
  },
  badCredentials: {
    tr: "E-posta ya da şifre yanlış. Tekrar dene ya da şifreni sıfırla.",
    en: "Email or password is wrong. Try again or reset your password.",
    de: "E-Mail oder Passwort ist falsch. Versuche es erneut oder setze dein Passwort zurück.",
    es: "El correo o la contraseña no son correctos. Inténtalo de nuevo o restablece tu contraseña.",
    fr: "L'e-mail ou le mot de passe est incorrect. Réessaie ou réinitialise ton mot de passe.",
    "pt-BR": "O e-mail ou a senha está incorreto. Tente novamente ou redefina sua senha.",
    it: "Email o password errata. Riprova oppure reimposta la password.",
  },
  emailInUse: {
    tr: "Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.",
    en: "An account with this email already exists. Try signing in.",
    de: "Mit dieser E-Mail-Adresse gibt es bereits ein Konto. Versuche, dich anzumelden.",
    es: "Ya existe una cuenta con este correo. Prueba a iniciar sesión.",
    fr: "Un compte existe déjà avec cet e-mail. Essaie de te connecter.",
    "pt-BR": "Já existe uma conta com este e-mail. Tente entrar.",
    it: "Esiste già un account con questa email. Prova ad accedere.",
  },
  weakPassword: {
    tr: "Şifre en az 8 karakter olmalı.",
    en: "Password must be at least 8 characters.",
    de: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    es: "La contraseña debe tener al menos 8 caracteres.",
    fr: "Le mot de passe doit contenir au moins 8 caractères.",
    "pt-BR": "A senha deve ter pelo menos 8 caracteres.",
    it: "La password deve avere almeno 8 caratteri.",
  },
  tooManyAttempts: {
    tr: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene ya da şifreni sıfırla.",
    en: "Too many attempts. Try again in a few minutes or reset your password.",
    de: "Zu viele Versuche. Versuche es in ein paar Minuten erneut oder setze dein Passwort zurück.",
    es: "Demasiados intentos. Inténtalo de nuevo en unos minutos o restablece tu contraseña.",
    fr: "Trop de tentatives. Réessaie dans quelques minutes ou réinitialise ton mot de passe.",
    "pt-BR": "Muitas tentativas. Tente novamente em alguns minutos ou redefina sua senha.",
    it: "Troppi tentativi. Riprova tra qualche minuto oppure reimposta la password.",
  },
  network: {
    tr: "İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene.",
    en: "Couldn't connect. Check your internet and try again.",
    de: "Keine Verbindung. Prüfe dein Internet und versuche es erneut.",
    es: "No se pudo conectar. Revisa tu conexión a internet e inténtalo de nuevo.",
    fr: "Connexion impossible. Vérifie ta connexion internet et réessaie.",
    "pt-BR": "Não foi possível conectar. Verifique sua internet e tente novamente.",
    it: "Impossibile connettersi. Controlla la connessione a internet e riprova.",
  },
  appleFailed: {
    tr: "Apple ile giriş yapılamadı. Tekrar dene ya da e-postayla devam et.",
    en: "Couldn't sign in with Apple. Try again or continue with email.",
    de: "Anmeldung mit Apple fehlgeschlagen. Versuche es erneut oder mache mit E-Mail weiter.",
    es: "No se pudo iniciar sesión con Apple. Inténtalo de nuevo o continúa con el correo.",
    fr: "Connexion avec Apple impossible. Réessaie ou continue avec l'e-mail.",
    "pt-BR": "Não foi possível entrar com a Apple. Tente novamente ou continue com o e-mail.",
    it: "Impossibile accedere con Apple. Riprova oppure continua con l'email.",
  },
  generic: {
    tr: "Bir şey ters gitti. Tekrar dene; sürerse Destek'e yaz.",
    en: "Something went wrong. Try again; if it continues, contact Support.",
    de: "Etwas ist schiefgelaufen. Versuche es erneut; wenn es weiter auftritt, schreibe dem Support.",
    es: "Algo salió mal. Inténtalo de nuevo; si sigue pasando, escribe a Soporte.",
    fr: "Un problème est survenu. Réessaie ; si cela continue, contacte le Support.",
    "pt-BR": "Algo deu errado. Tente novamente; se continuar, fale com o Suporte.",
    it: "Qualcosa è andato storto. Riprova; se continua, scrivi al Supporto.",
  },
};

export const ERROR_FIELD: Readonly<Record<ErrorCase, ErrorField>> = {
  invalidEmail: "email",
  badCredentials: "password",
  emailInUse: "email",
  weakPassword: "password",
  tooManyAttempts: "form",
  network: "form",
  appleFailed: "form",
  generic: "form",
};

/** Internal code to UX case (plan.md section 2, item 4). */
export const CASE_OF_CODE: Readonly<Record<AuthErrorCode, ErrorCase>> = {
  badCredentials: "badCredentials",
  invalidEmail: "invalidEmail",
  appleFailed: "appleFailed",
  appleRejected: "appleFailed",
  emailInUse: "emailInUse",
  weakPassword: "weakPassword",
  tooManyAttempts: "tooManyAttempts",
  offline: "network",
  timeout: "network",
  disabled: "generic",
  unknown: "generic",
  sessionExpired: "generic",
  needsRecentLogin: "generic",
};

export type ErrorView = { case: ErrorCase; field: ErrorField; text: string };

export function errorFor(code: AuthErrorCode, lang: Lang): ErrorView {
  const c = CASE_OF_CODE[code] ?? "generic";
  return { case: c, field: ERROR_FIELD[c], text: ERROR_TEXT[c][lang] };
}

/** Text for an unexpected thrown value: always the generic case. */
export function genericError(lang: Lang): ErrorView {
  return errorFor("unknown", lang);
}

export const COPY = {
  title: { tr: "Hesabın", en: "Your account", de: "Dein Konto", es: "Tu cuenta", fr: "Ton compte", "pt-BR": "Sua conta", it: "Il tuo account"  },
  modeSignIn: { tr: "Giriş yap", en: "Sign in", de: "Anmelden", es: "Iniciar sesión", fr: "Se connecter", "pt-BR": "Entrar", it: "Accedi"  },
  modeSignUp: { tr: "Hesap oluştur", en: "Create account", de: "Konto erstellen", es: "Crear cuenta", fr: "Créer un compte", "pt-BR": "Criar conta", it: "Crea account"  },
  passwordHint: { tr: "En az 8 karakter.", en: "At least 8 characters.", de: "Mindestens 8 Zeichen.", es: "Al menos 8 caracteres.", fr: "Au moins 8 caractères.", "pt-BR": "Pelo menos 8 caracteres.", it: "Almeno 8 caratteri."  },
  value: {
    tr: "Hesap şimdilik yalnızca destekte seni tanımamıza yarar. Videolarını ve fotoğraflarını saklamaz; onlar yalnızca bu telefonda kalır.",
    en: "For now an account only lets support recognize you. It does not store your videos or photos; those stay on this phone only.",
    de: "Ein Konto hilft dem Support vorerst nur, dich zu erkennen. Deine Videos und Fotos werden nicht gespeichert; sie bleiben nur auf diesem Telefon.",
    es: "Por ahora, una cuenta solo sirve para que soporte te reconozca. No guarda tus vídeos ni fotos; esos se quedan solo en este teléfono.",
    fr: "Pour l'instant, un compte sert seulement au support à te reconnaître. Il ne conserve ni tes vidéos ni tes photos ; elles restent uniquement sur ce téléphone.",
    "pt-BR": "Por enquanto, uma conta serve apenas para o suporte reconhecer você. Ela não guarda seus vídeos nem fotos; eles ficam somente neste telefone.",
    it: "Per ora un account serve solo al supporto per riconoscerti. Non conserva i tuoi video né le foto: restano solo su questo telefono.",
  },
  // Password reset
  resetTitle: { tr: "E-postanı kontrol et", en: "Check your email", de: "Prüfe deine E-Mails", es: "Revisa tu correo", fr: "Vérifie tes e-mails", "pt-BR": "Verifique seu e-mail", it: "Controlla la tua email"  },
  /** {email} is replaced by the address the user typed. */
  resetSent: {
    tr: "Bu adres kayıtlıysa {email} adresine şifre sıfırlama bağlantısı gönderdik. Gelmediyse gereksiz e-posta klasörüne de bak.",
    en: "If this address is registered, we sent a password reset link to {email}. If it doesn't arrive, check your spam folder too.",
    de: "Wenn diese Adresse registriert ist, haben wir einen Link zum Zurücksetzen des Passworts an {email} gesendet. Falls er nicht ankommt, sieh auch im Spam-Ordner nach.",
    es: "Si esta dirección está registrada, hemos enviado un enlace para restablecer la contraseña a {email}. Si no llega, revisa también la carpeta de spam.",
    fr: "Si cette adresse est enregistrée, nous avons envoyé un lien de réinitialisation du mot de passe à {email}. S'il n'arrive pas, regarde aussi dans tes courriers indésirables.",
    "pt-BR": "Se este endereço estiver cadastrado, enviamos um link para redefinir a senha para {email}. Se não chegar, verifique também a caixa de spam.",
    it: "Se questo indirizzo è registrato, abbiamo inviato un link per reimpostare la password a {email}. Se non arriva, controlla anche la cartella dello spam.",
  },
  resetBack: { tr: "Giriş ekranına dön", en: "Back to sign in", de: "Zurück zur Anmeldung", es: "Volver a iniciar sesión", fr: "Retour à la connexion", "pt-BR": "Voltar para o login", it: "Torna all'accesso"  },
  resetResend: { tr: "Tekrar gönder", en: "Send again", de: "Erneut senden", es: "Enviar de nuevo", fr: "Renvoyer", "pt-BR": "Enviar novamente", it: "Invia di nuovo"  },
  // Sign out and delete
  signedOutToast: { tr: "Çıkış yaptın.", en: "You signed out.", de: "Du hast dich abgemeldet.", es: "Has cerrado sesión.", fr: "Tu es déconnecté.", "pt-BR": "Você saiu da conta.", it: "Hai effettuato la disconnessione."  },
  deleteSheetTitle: { tr: "Hesabın silinsin mi?", en: "Delete your account?", de: "Konto löschen?", es: "¿Eliminar tu cuenta?", fr: "Supprimer ton compte ?", "pt-BR": "Excluir sua conta?", it: "Eliminare il tuo account?"  },
  deleteSheetBody: {
    tr: "Hesabın silinir. Bu geri alınamaz. Videoların ve fotoğrafların bu telefonda kalır. Vidora Pro aboneliğin Apple tarafından yönetilir ve bu işlemle iptal edilmez; iptal için Ayarlar > Aboneliği yönet.",
    en: "Your account will be deleted. This can't be undone. Your videos and photos stay on this phone. Your Vidora Pro subscription is managed by Apple and is not cancelled by this; to cancel, go to Settings > Manage subscription.",
    de: "Dein Konto wird gelöscht. Das kann nicht rückgängig gemacht werden. Deine Videos und Fotos bleiben auf diesem Telefon. Dein Vidora-Pro-Abo wird von Apple verwaltet und dadurch nicht gekündigt; zum Kündigen gehe zu Einstellungen > Abo verwalten.",
    es: "Tu cuenta se eliminará. Esto no se puede deshacer. Tus vídeos y fotos se quedan en este teléfono. Tu suscripción a Vidora Pro la gestiona Apple y no se cancela con esto; para cancelarla, ve a Ajustes > Gestionar suscripción.",
    fr: "Ton compte sera supprimé. Cette action est irréversible. Tes vidéos et photos restent sur ce téléphone. Ton abonnement Vidora Pro est géré par Apple et n'est pas résilié par cette action ; pour le résilier, va dans Réglages > Gérer l'abonnement.",
    "pt-BR": "Sua conta será excluída. Isso não pode ser desfeito. Seus vídeos e fotos continuam neste telefone. Sua assinatura do Vidora Pro é gerenciada pela Apple e não é cancelada por esta ação; para cancelar, vá em Ajustes > Gerenciar assinatura.",
    it: "Il tuo account verrà eliminato. L'azione non si può annullare. I tuoi video e le tue foto restano su questo telefono. L'abbonamento a Vidora Pro è gestito da Apple e non viene annullato da questa azione; per annullarlo vai in Impostazioni > Gestisci abbonamento.",
  },
  deleteContinue: { tr: "Devam et", en: "Continue", de: "Weiter", es: "Continuar", fr: "Continuer", "pt-BR": "Continuar", it: "Continua"  },
  deleteCancel: { tr: "Vazgeç", en: "Cancel", de: "Abbrechen", es: "Cancelar", fr: "Annuler", "pt-BR": "Cancelar", it: "Annulla"  },
  deletePasswordPrompt: { tr: "Silmek için şifreni gir.", en: "Enter your password to delete.", de: "Gib zum Löschen dein Passwort ein.", es: "Introduce tu contraseña para eliminarla.", fr: "Saisis ton mot de passe pour supprimer.", "pt-BR": "Digite sua senha para excluir.", it: "Inserisci la password per eliminare."  },
  deleteConfirm: { tr: "Hesabı kalıcı olarak sil", en: "Delete account permanently", de: "Konto endgültig löschen", es: "Eliminar la cuenta definitivamente", fr: "Supprimer définitivement le compte", "pt-BR": "Excluir a conta permanentemente", it: "Elimina l'account definitivamente"  },
  deleteButton: { tr: "Hesabı sil", en: "Delete account", de: "Konto löschen", es: "Eliminar cuenta", fr: "Supprimer le compte", "pt-BR": "Excluir conta", it: "Elimina account"  },
  deletedToast: { tr: "Hesabın silindi.", en: "Your account was deleted.", de: "Dein Konto wurde gelöscht.", es: "Tu cuenta se eliminó.", fr: "Ton compte a été supprimé.", "pt-BR": "Sua conta foi excluída.", it: "Il tuo account è stato eliminato."  },
  deleteOffline: {
    tr: "İnternete bağlanamadık. Hesabın silinmedi.",
    en: "We couldn't connect. Your account was not deleted.",
    de: "Keine Verbindung. Dein Konto wurde nicht gelöscht.",
    es: "No pudimos conectar. Tu cuenta no se eliminó.",
    fr: "Connexion impossible. Ton compte n'a pas été supprimé.",
    "pt-BR": "Não foi possível conectar. Sua conta não foi excluída.",
    it: "Impossibile connettersi. Il tuo account non è stato eliminato.",
  },
  // Form labels and controls (docs/giris/ux.md section 2; Paket 2 additions)
  modeLabel: { tr: "Hesap işlemi", en: "Account action", de: "Kontoaktion", es: "Acción de cuenta", fr: "Action du compte", "pt-BR": "Ação da conta", it: "Azione dell'account"  },
  emailLabel: { tr: "E-posta", en: "Email", de: "E-Mail", es: "Correo", fr: "E-mail", "pt-BR": "E-mail", it: "Email"  },
  passwordLabel: { tr: "Şifre", en: "Password", de: "Passwort", es: "Contraseña", fr: "Mot de passe", "pt-BR": "Senha", it: "Password"  },
  show: { tr: "Göster", en: "Show", de: "Zeigen", es: "Mostrar", fr: "Afficher", "pt-BR": "Mostrar", it: "Mostra"  },
  hide: { tr: "Gizle", en: "Hide", de: "Verbergen", es: "Ocultar", fr: "Masquer", "pt-BR": "Ocultar", it: "Nascondi"  },
  showSpoken: { tr: "Şifreyi göster", en: "Show password", de: "Passwort anzeigen", es: "Mostrar contraseña", fr: "Afficher le mot de passe", "pt-BR": "Mostrar senha", it: "Mostra password"  },
  hideSpoken: { tr: "Şifreyi gizle", en: "Hide password", de: "Passwort verbergen", es: "Ocultar contraseña", fr: "Masquer le mot de passe", "pt-BR": "Ocultar senha", it: "Nascondi password"  },
  forgot: { tr: "Şifremi unuttum", en: "Forgot password", de: "Passwort vergessen", es: "Olvidé mi contraseña", fr: "Mot de passe oublié", "pt-BR": "Esqueci a senha", it: "Password dimenticata"  },
  skip: { tr: "Şimdilik geç", en: "Not now", de: "Jetzt nicht", es: "Ahora no", fr: "Pas maintenant", "pt-BR": "Agora não", it: "Non ora"  },
  signOut: { tr: "Çıkış yap", en: "Sign out", de: "Abmelden", es: "Cerrar sesión", fr: "Se déconnecter", "pt-BR": "Sair", it: "Esci"  },
  /** Lead-in of the two legal links (the links are separate controls). */
  termsLead: {
    tr: "Devam ederek şunları kabul etmiş olursun:",
    en: "By continuing you accept:",
    de: "Wenn du fortfährst, akzeptierst du:",
    es: "Al continuar aceptas:",
    fr: "En continuant, tu acceptes :",
    "pt-BR": "Ao continuar, você aceita:",
    it: "Continuando accetti:",
  },
  termsLink: { tr: "Kullanım Koşulları", en: "Terms of Use", de: "Nutzungsbedingungen", es: "Términos de uso", fr: "Conditions d'utilisation", "pt-BR": "Termos de Uso", it: "Termini di utilizzo"  },
  privacyLink: { tr: "Gizlilik Politikası", en: "Privacy Policy", de: "Datenschutzerklärung", es: "Política de privacidad", fr: "Politique de confidentialité", "pt-BR": "Política de Privacidade", it: "Informativa sulla privacy"  },
  // Spoken (and shown by the button) while a request runs
  busySignIn: { tr: "Giriş yapılıyor", en: "Signing in", de: "Anmeldung läuft", es: "Iniciando sesión", fr: "Connexion en cours", "pt-BR": "Entrando", it: "Accesso in corso"  },
  busySignUp: { tr: "Hesap oluşturuluyor", en: "Creating your account", de: "Konto wird erstellt", es: "Creando tu cuenta", fr: "Création du compte", "pt-BR": "Criando sua conta", it: "Creazione dell'account"  },
  busySend: { tr: "Gönderiliyor", en: "Sending", de: "Wird gesendet", es: "Enviando", fr: "Envoi en cours", "pt-BR": "Enviando", it: "Invio in corso"  },
  busyDelete: { tr: "Hesap siliniyor", en: "Deleting your account", de: "Konto wird gelöscht", es: "Eliminando tu cuenta", fr: "Suppression du compte", "pt-BR": "Excluindo sua conta", it: "Eliminazione dell'account"  },
  /** {n} is replaced by whole seconds. */
  resetResendWait: { tr: "Tekrar gönder ({n} sn)", en: "Send again ({n} s)", de: "Erneut senden ({n} s)", es: "Enviar de nuevo ({n} s)", fr: "Renvoyer ({n} s)", "pt-BR": "Enviar novamente ({n} s)", it: "Invia di nuovo ({n} s)"  },
  resetResendWaitSpoken: {
    tr: "Tekrar gönder, {n} saniye sonra etkin olacak",
    en: "Send again, available in {n} seconds",
    de: "Erneut senden, verfügbar in {n} Sekunden",
    es: "Enviar de nuevo, disponible en {n} segundos",
    fr: "Renvoyer, disponible dans {n} secondes",
    "pt-BR": "Enviar novamente, disponível em {n} segundos",
    it: "Invia di nuovo, disponibile tra {n} secondi",
  },
  // Notices (shown once on the account screen)
  noticeSessionExpired: {
    tr: "Oturum süresi doldu. Tekrar giriş yap.",
    en: "Your session expired. Please sign in again.",
    de: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
    es: "Tu sesión caducó. Inicia sesión de nuevo.",
    fr: "Ta session a expiré. Connecte-toi à nouveau.",
    "pt-BR": "Sua sessão expirou. Entre novamente.",
    it: "La tua sessione è scaduta. Accedi di nuovo.",
  },
  noticeDeleteIncomplete: {
    tr: "Hesap silme tamamlanmadı, tekrar dene.",
    en: "Account deletion didn't finish. Please try again.",
    de: "Das Löschen des Kontos wurde nicht abgeschlossen. Bitte versuche es erneut.",
    es: "La eliminación de la cuenta no se completó. Inténtalo de nuevo.",
    fr: "La suppression du compte n'a pas abouti. Réessaie.",
    "pt-BR": "A exclusão da conta não foi concluída. Tente novamente.",
    it: "L'eliminazione dell'account non è stata completata. Riprova.",
  },
  // Settings row and Library welcome line (plan.md "Paket 3")
  settingsSection: { tr: "Hesap", en: "Account", de: "Konto", es: "Cuenta", fr: "Compte", "pt-BR": "Conta", it: "Account"  },
  settingsRow: { tr: "Hesap", en: "Account", de: "Konto", es: "Cuenta", fr: "Compte", "pt-BR": "Conta", it: "Account"  },
  /** Separator between the Apple button and the email form. */
  or: { tr: "veya", en: "or", de: "oder", es: "o", fr: "ou", "pt-BR": "ou", it: "oppure"  },
  providerApple: { tr: "Apple ile giriş yapıldı", en: "Signed in with Apple", de: "Mit Apple angemeldet", es: "Sesión iniciada con Apple", fr: "Connecté avec Apple", "pt-BR": "Conectado com a Apple", it: "Accesso eseguito con Apple"  },
  providerPassword: { tr: "E-posta ile giriş yapıldı", en: "Signed in with email", de: "Mit E-Mail angemeldet", es: "Sesión iniciada con correo", fr: "Connecté avec l'e-mail", "pt-BR": "Conectado com e-mail", it: "Accesso eseguito con email"  },
  appleEmailHidden: { tr: "E-posta gizli (Apple)", en: "Email hidden (Apple)", de: "E-Mail verborgen (Apple)", es: "Correo oculto (Apple)", fr: "E-mail masqué (Apple)", "pt-BR": "E-mail oculto (Apple)", it: "Email nascosta (Apple)"  },
  deleteAppleBody: {
    tr: "Hesabını silmek için şifre gerekmez; Apple ile giriş yaptın.",
    en: "No password is needed to delete your account; you signed in with Apple.",
    de: "Zum Löschen deines Kontos ist kein Passwort nötig; du hast dich mit Apple angemeldet.",
    es: "No hace falta contraseña para eliminar tu cuenta; iniciaste sesión con Apple.",
    fr: "Aucun mot de passe n'est nécessaire pour supprimer ton compte ; tu t'es connecté avec Apple.",
    "pt-BR": "Não é preciso senha para excluir sua conta; você entrou com a Apple.",
    it: "Per eliminare l'account non serve la password: hai effettuato l'accesso con Apple.",
  },
  deleteAppleAgain: {
    tr: "Güvenlik için önce çıkış yapıp Apple ile tekrar giriş yap, sonra hesabı sil.",
    en: "For security, sign out and sign in with Apple again, then delete the account.",
    de: "Melde dich aus Sicherheitsgründen ab und erneut mit Apple an, dann lösche das Konto.",
    es: "Por seguridad, cierra sesión e inicia sesión de nuevo con Apple; después elimina la cuenta.",
    fr: "Par sécurité, déconnecte-toi puis reconnecte-toi avec Apple, puis supprime le compte.",
    "pt-BR": "Por segurança, saia e entre novamente com a Apple; depois exclua a conta.",
    it: "Per sicurezza, esci e accedi di nuovo con Apple, poi elimina l'account.",
  },
  busyApple: { tr: "Apple ile giriş yapılıyor", en: "Signing in with Apple", de: "Anmeldung mit Apple läuft", es: "Iniciando sesión con Apple", fr: "Connexion avec Apple en cours", "pt-BR": "Entrando com a Apple", it: "Accesso con Apple in corso"  },
  notSignedIn: { tr: "Giriş yapılmadı", en: "Not signed in", de: "Nicht angemeldet", es: "Sin iniciar sesión", fr: "Non connecté", "pt-BR": "Sem login", it: "Non hai effettuato l'accesso"  },
  welcomeOpen: {
    tr: "Hesap aç, isteğe bağlı",
    en: "Create an account, optional",
    de: "Konto erstellen, optional",
    es: "Crea una cuenta, opcional",
    fr: "Crée un compte, facultatif",
    "pt-BR": "Crie uma conta, opcional",
    it: "Crea un account, facoltativo",
  },
  welcomeDismiss: { tr: "Kapat", en: "Close", de: "Schließen", es: "Cerrar", fr: "Fermer", "pt-BR": "Fechar", it: "Chiudi"  },
} as const satisfies Record<string, Pair>;

/** Text for an error thrown while deleting; offline gets the "not deleted" sentence. */
export function deleteErrorFor(
  code: AuthErrorCode,
  lang: Lang,
  provider: "apple" | "password" = "password",
): ErrorView {
  if (provider === "apple" && code === "needsRecentLogin")
    return { ...errorFor("unknown", lang), text: COPY.deleteAppleAgain[lang] };
  if (code === "offline") return { ...errorFor(code, lang), text: COPY.deleteOffline[lang] };
  return errorFor(code, lang);
}

export function noticeText(
  notice: "sessionExpired" | "deleteIncomplete",
  lang: Lang,
): string {
  return notice === "sessionExpired"
    ? COPY.noticeSessionExpired[lang]
    : COPY.noticeDeleteIncomplete[lang];
}

/**
 * Legal text of the sign-up form (docs/giris/gizlilik-ve-inceleme.md section 6:
 * KVKK m.10 notice and the unticked, mandatory consent box). Kept out of COPY
 * on purpose: it has to name Firebase, which COPY's tests forbid.
 */
export const LEGAL_COPY = {
  notice: {
    tr: "Hesap açarsan e-posta adresin ve şifren, hesabını yönetmek için Berk Demirok (veri sorumlusu) adına Google Firebase Authentication'da (ABD dahil yurt dışı) işlenir; pazarlamada kullanılmaz. Haklarına ve silmeye ilişkin ayrıntı Gizlilik Politikası'nda; başvuru: support@example.com.",
    en: "If you create an account, your email address and password are processed by Google Firebase Authentication (including abroad, in the USA) on behalf of Berk Demirok (data controller) to manage your account; they are not used for marketing. Details on your rights and on deletion are in the Privacy Policy; contact: support@example.com.",
    de: "Wenn du ein Konto erstellst, werden deine E-Mail-Adresse und dein Passwort von Google Firebase Authentication (auch im Ausland, in den USA) im Auftrag von Berk Demirok (Verantwortlicher) verarbeitet, um dein Konto zu verwalten; sie werden nicht für Marketing verwendet. Einzelheiten zu deinen Rechten und zur Löschung stehen in der Datenschutzerklärung; Kontakt: support@example.com.",
    es: "Si creas una cuenta, tu correo electrónico y tu contraseña son tratados por Google Firebase Authentication (también en el extranjero, en EE. UU.) por cuenta de Berk Demirok (responsable del tratamiento) para gestionar tu cuenta; no se usan para marketing. Los detalles sobre tus derechos y la eliminación están en la Política de privacidad; contacto: support@example.com.",
    fr: "Si tu crées un compte, ton adresse e-mail et ton mot de passe sont traités par Google Firebase Authentication (y compris à l'étranger, aux États-Unis) pour le compte de Berk Demirok (responsable du traitement) afin de gérer ton compte ; ils ne servent pas au marketing. Les détails sur tes droits et sur la suppression figurent dans la Politique de confidentialité ; contact : support@example.com.",
    "pt-BR": "Se você criar uma conta, seu e-mail e sua senha são processados pelo Google Firebase Authentication (inclusive no exterior, nos EUA) em nome de Berk Demirok (controlador de dados) para gerenciar sua conta; não são usados para marketing. Detalhes sobre seus direitos e sobre a exclusão estão na Política de Privacidade; contato: support@example.com.",
    it: "Se crei un account, il tuo indirizzo email e la tua password vengono trattati da Google Firebase Authentication (anche all'estero, negli Stati Uniti) per conto di Berk Demirok (titolare del trattamento) per gestire il tuo account; non vengono usati per il marketing. I dettagli sui tuoi diritti e sull'eliminazione sono nell'Informativa sulla privacy; contatto: support@example.com.",
  },
  consent: {
    tr: "Verilerimin yurt dışındaki Firebase sunucularında işlenmesine açık rıza veriyorum.",
    en: "I consent to my data being processed on Firebase servers abroad.",
    de: "Ich willige ein, dass meine Daten auf Firebase-Servern im Ausland verarbeitet werden.",
    es: "Doy mi consentimiento para que mis datos se traten en servidores de Firebase en el extranjero.",
    fr: "Je consens à ce que mes données soient traitées sur des serveurs Firebase à l'étranger.",
    "pt-BR": "Consinto que meus dados sejam processados em servidores do Firebase no exterior.",
    it: "Acconsento al trattamento dei miei dati su server Firebase all'estero.",
  },
} as const satisfies Record<string, Pair>;

/** Replaces {n} by a whole number of seconds. */
export function secondsText(pair: Pair, n: number, lang: Lang): string {
  return pair[lang].replace("{n}", String(n));
}

export function resetSentText(email: string, lang: Lang): string {
  return COPY.resetSent[lang].replace("{email}", email);
}
