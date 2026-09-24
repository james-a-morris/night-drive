import type { ClerkBrowser } from "./browser.d.ts";
import type { Lifecycle } from "./lifecycle.ts";

let clerk: ClerkBrowser | undefined;
let ready: Promise<ClerkBrowser> | undefined;

function navigateAuth(to: string, replace = false) {
  const current = new URL(window.location.href);
  const destination = new URL(to, current);
  if (destination.origin === current.origin && destination.pathname === current.pathname) {
    // Completing authentication returns to this cabin. A document navigation
    // would recreate the scene and stop its audio, timer, and current journey.
    clerk?.closeSignIn?.();
    clerk?.closeSignUp?.();
    if (destination.href !== current.href) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method](window.history.state, "", destination.href);
    }
    return;
  }
  // Other destinations (including verification routes) still navigate normally.
  if (replace) window.location.replace(destination.href);
  else window.location.assign(destination.href);
}

// Keep Clerk's verification and security flows, with the same visual language
// as the road's own controls. Stable appearance hooks also cover later steps.
const appearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#efb191",
    colorPrimaryForeground: "#101a20",
    colorBackground: "#101e26",
    colorForeground: "#f0eee5",
    colorMuted: "#1b2b33",
    colorMutedForeground: "#a4b1b3",
    colorInput: "#0d1921",
    colorInputForeground: "#f0eee5",
    colorNeutral: "#f0eee5",
    colorBorder: "#39464b",
    colorRing: "#efb191",
    colorDanger: "#f4bca8",
    colorSuccess: "#a2bca1",
    fontFamily: "var(--font-ui)",
    fontFamilyButtons: "var(--font-ui)",
    fontFamilyMono: "var(--font-ui)",
    fontSize: "var(--text-body)",
    borderRadius: "6px",
  },
  elements: {
    modalBackdrop: "night-auth-backdrop",
    modalContent: "night-auth-modal",
    modalCloseButton: "night-auth-close",
    rootBox: "night-auth-root",
    cardBox: "night-auth-card-box",
    card: "night-auth-card",
    headerTitle: "night-auth-title",
    headerSubtitle: "night-auth-subtitle",
    formFieldLabel: "night-auth-label",
    formFieldInput: "night-auth-input",
    formButtonPrimary: "night-auth-primary",
    socialButtonsBlockButton: "night-auth-social",
    footer: "night-auth-footer",
    footerAction: "night-auth-footer-action",
    navbar: "night-account-navbar",
    navbarButton: "night-account-tab",
    pageScrollBox: "night-account-scroll",
    page: "night-account-page",
    badge: "night-account-badge",
    profileSectionTitleText: "night-account-section-title",
    profileSectionPrimaryButton: "night-account-edit",
  },
};

function loadScript(src: string, attributes: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    for (const [name, value] of Object.entries(attributes))
      script.setAttribute(name, value);
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Sign-in could not load. Please try again."));
    document.head.append(script);
  });
}

function loadClerk() {
  ready ||= (async () => {
    const response = await fetch("/api/config", {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        "Sign-in is temporarily unavailable. You can still travel as a guest.",
      );
    const { clerkPublishableKey } = await response.json();
    if (!clerkPublishableKey)
      throw new Error(
        "Sign-in is being connected. You can still travel as a guest.",
      );
    const domain = atob(clerkPublishableKey.split("_")[2]).replace(/\$$/, "");
    if (!/^[a-z0-9.-]+$/i.test(domain))
      throw new Error("Sign-in configuration is invalid.");
    await Promise.all([
      loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`),
      loadScript(
        `https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
        { "data-clerk-publishable-key": clerkPublishableKey },
      ),
    ]);
    const client = window.Clerk;
    if (!client) throw new Error("Sign-in could not load. Please try again.");
    clerk = client;
    await client.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      routerPush: (to: string) => navigateAuth(to),
      routerReplace: (to: string) => navigateAuth(to, true),
      signInForceRedirectUrl: window.location.pathname,
      signUpForceRedirectUrl: window.location.pathname,
      appearance,
      localization: {
        signIn: {
          start: {
            title: "Welcome back.",
            subtitle: "Your window seat is waiting.",
          },
        },
        signUp: {
          start: {
            title: "Make yourself at home.",
            subtitle: "Keep your progress. Bring a little intention.",
          },
        },
        userProfile: {
          navbar: {
            title: "Your account",
            description: "A little space of your own.",
          },
        },
      },
    });
    return client;
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

export function observeAuth(
  scope: Lifecycle,
  onChange: (signedIn: boolean) => void,
) {
  let lastUserId: string | null | undefined;
  void scope
    .task(async () => {
      const client = await loadClerk();
      scope.signal.throwIfAborted();
      scope.defer(
        client.addListener(({ user }) => {
          const userId = user?.id || null;
          if (userId !== lastUserId) {
            lastUserId = userId;
            onChange(Boolean(user));
          }
        }),
      );
    })
    .catch(() => {});
  scope.defer(() => {
    clerk?.closeSignIn?.();
    clerk?.closeSignUp?.();
    clerk?.closeUserProfile?.();
  });
}

export const manageAccount = () => clerk?.openUserProfile();
export const signOut = () => clerk!.signOut();

export async function authHeaders(): Promise<Record<string, string>> {
  const token = clerk?.session ? await clerk.session.getToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function openAuth(
  signUp = false,
  { signal }: { signal?: AbortSignal } = {},
) {
  const client = await loadClerk();
  signal?.throwIfAborted();
  if (signUp) client.openSignUp();
  else client.openSignIn();
}
