export interface ClerkBrowser {
  load(options: Record<string, unknown>): Promise<void>;
  addListener(
    listener: (state: { user: { id: string } | null }) => void,
  ): () => void;
  session?: { getToken(): Promise<string | null> } | null;
  openSignUp(): void;
  openSignIn(): void;
  openUserProfile(options?: {
    customPages: Array<{ label: "account" | "security" } | {
      label: string;
      url: string;
      mount(element: HTMLDivElement): void;
      unmount(element: HTMLDivElement): void;
      mountIcon(element: HTMLDivElement): void;
      unmountIcon(element: HTMLDivElement): void;
    }>;
  }): void;
  closeSignIn?(): void;
  closeSignUp?(): void;
  closeUserProfile?(): void;
  signOut(): Promise<void>;
}
declare global {
  var webkitAudioContext: typeof AudioContext | undefined;
  // Chromium-only heap reading, used by the dev kit overlay.
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
  interface Window {
    Clerk?: ClerkBrowser;
    __internal_ClerkUICtor?: unknown;
  }
}
