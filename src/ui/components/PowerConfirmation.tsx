import type { PowerAction } from "../types";

type Props = {
  action: PowerAction;
  onCancel: () => void;
  onConfirm: () => void;
};

const actionLabels: Record<PowerAction, string> = {
  logout: "Log out",
  lock: "Lock",
  shutdown: "Shut down",
  restart: "Restart",
};

export function PowerConfirmation({ action, onCancel, onConfirm }: Props) {
  return (
    <div className="power-confirm-backdrop" role="presentation">
      <section
        className="power-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="power-confirm-title"
      >
        <h2 id="power-confirm-title">Confirm {action}?</h2>
        <p>This action will affect your current desktop session.</p>
        <div>
          <button onClick={onCancel}>Cancel</button>
          <button className="confirm-action" onClick={onConfirm}>
            {actionLabels[action]}
          </button>
        </div>
      </section>
    </div>
  );
}
