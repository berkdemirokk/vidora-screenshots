import { Redirect } from "expo-router";

/**
 * Unknown routes and deep links (e.g. vidora://xyz) go to the home screen
 * instead of expo-router's English "Unmatched Route" page.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
