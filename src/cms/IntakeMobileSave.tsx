"use client";

import { SaveButton, useEditDepth } from "@payloadcms/ui";
import { createPortal } from "react-dom";
import { MobileSaveBar, useStaffMobileWidth } from "@/components/admin/StaffMobileEditor";

export function IntakeMobileSave() {
  const mobile = useStaffMobileWidth();
  const depth = useEditDepth();
  if (!mobile || depth !== 1) return <SaveButton />;
  return createPortal(
    <MobileSaveBar fixed>
      <SaveButton />
    </MobileSaveBar>,
    document.body,
  );
}
