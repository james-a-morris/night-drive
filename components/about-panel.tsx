import Dialog from "./dialog.tsx";
import Brand from "./brand.tsx";

export default function AboutPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="about-panel"
      id="about"
      aria-labelledby="about-title"
    >
      <div className="about-header">
        <h2 className="brand about-brand" id="about-title">
          <Brand />
        </h2>
        <button
          id="about-close"
          className="about-close"
          onClick={onClose}
          type="button"
          aria-label="Close about panel"
          autoFocus
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m5 5 10 10M15 5 5 15"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="about-body">
        <div className="about-note">
          <p>I built this because there’s been a lot going on lately.</p>
          <p>
            There have been a lot of nights where the quiet has been unsettling
            and listening to music just doesn’t feel the same.
          </p>
          <p>
            Music binds us. I wanted a place to sit back and enjoy it while I
            wait for things to finish and things to calm down.
          </p>
          <p>
            We might be strangers passing through the night, but for a little
            while, we’re on the same train, letting the music carry us.
          </p>
        </div>
        <footer className="about-footer">
          <a
            className="about-creator"
            href="https://x.com/BlockChainJimbo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit @BlockChainJimbo on X / Twitter (opens in a new tab)"
          >
            <img
              src="/assets/blockchainjimbo.png"
              width={40}
              height={40}
              alt=""
              decoding="async"
            />
            <span className="about-creator-copy">
              <strong>@BlockChainJimbo</strong>
              <span className="about-creator-invite">X / Twitter</span>
            </span>
            <svg
              className="about-creator-arrow"
              width={18}
              height={18}
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 15 15 5M5 5h10v10"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </footer>
      </div>
    </Dialog>
  );
}
