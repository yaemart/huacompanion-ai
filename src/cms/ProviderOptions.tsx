"use client";
import { useField, useFormProcessing } from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import { ProviderOptionsPanel } from "./ProviderOptionsPanel";
export const ProviderOptions: TextFieldClientComponent = ({ path, field, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path }),
    saving = useFormProcessing();
  return (
    <ProviderOptionsPanel
      kind={field.name === "languages" ? "languages" : "city"}
      path={path}
      value={value || ""}
      disabled={!!readOnly || saving}
      error={showError ? errorMessage : undefined}
      onChange={setValue}
    />
  );
};
