import { useId, type ButtonHTMLAttributes } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled" | "aria-describedby"> & {
  reason?: string;
};

export function StaffActionButton({ reason, children, type = "button", ...button }: Props) {
  const explanation = useId();
  return (
    <span className="staff-action-button">
      <button
        {...button}
        type={type}
        disabled={!!reason}
        aria-describedby={reason ? explanation : undefined}
      >
        {children}
      </button>
      {reason && <small id={explanation}>{reason}</small>}
    </span>
  );
}
