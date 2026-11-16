"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { staffKeyboardOverlap } from "@/lib/staff-mobile-editor";

const mobileWidth = "(max-width: 750px)";
const fieldSelector =
  "textarea:not([readonly]):not([disabled]), input:not([readonly]):not([disabled]):not([type=checkbox]):not([type=radio])";
const overlaps = "--staff-keyboard-overlap";
const saveHeight = "--staff-mobile-save-height";

function subscribeMobile(onChange: () => void) {
  const media = window.matchMedia(mobileWidth);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useStaffMobileWidth() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(mobileWidth).matches,
    () => false,
  );
}

export function MobileSaveBar({
  children,
  fixed = false,
}: {
  children: ReactNode;
  fixed?: boolean;
}) {
  const mobile = useStaffMobileWidth();
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile || !bar.current) return;
    const toolbar = bar.current;
    const viewport = window.visualViewport;
    let current = 0;
    let focusFrame = 0;
    const root = document.documentElement;
    const measure = () => root.style.setProperty(saveHeight, `${toolbar.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    measure();
    function update() {
      if (!viewport) return;
      const focused = document.activeElement;
      const typing =
        focused instanceof HTMLElement &&
        (focused.isContentEditable || focused.matches(fieldSelector));
      // Keep the bar steady when tapping Save blurs an input before the keyboard has closed.
      const next = staffKeyboardOverlap(window.innerHeight, viewport, typing || current > 0);
      if (next === current) return;
      const opening = next > current;
      current = next;
      root.style.setProperty(overlaps, `${next}px`);
      if (opening && typing) {
        window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => {
          if (document.activeElement !== focused) return;
          const toolbarTop = toolbar.getBoundingClientRect().top;
          const field = focused.getBoundingClientRect();
          const available = toolbarTop - viewport.offsetTop;
          if (field.height < available - 16 && field.bottom + 12 > toolbarTop) {
            window.scrollBy({ top: field.bottom + 12 - toolbarTop, behavior: "instant" });
          }
        });
      }
    }
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      observer.disconnect();
      root.style.removeProperty(overlaps);
      root.style.removeProperty(saveHeight);
    };
  }, [mobile]);

  return (
    <div
      ref={bar}
      className={fixed ? "staff-mobile-save staff-mobile-save--fixed" : "staff-mobile-save"}
    >
      {children}
    </div>
  );
}

export function StaffEditorGroup({
  title,
  children,
  mobileHeading = false,
}: {
  title: string;
  children: ReactNode;
  mobileHeading?: boolean;
}) {
  const heading = useId();
  return (
    <section className="staff-editor-group" aria-labelledby={heading}>
      <h3 className={mobileHeading ? "staff-editor-group__mobile-title" : undefined} id={heading}>
        {title}
      </h3>
      {children}
    </section>
  );
}
