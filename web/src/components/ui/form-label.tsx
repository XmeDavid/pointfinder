import * as React from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";

type FormLabelProps = React.ComponentPropsWithoutRef<typeof Label> & {
  required?: boolean;
  optional?: boolean;
};

export function FormLabel({ children, required = false, optional = false, ...props }: FormLabelProps) {
  const { t } = useTranslation();

  return (
    <Label {...props}>
      {children}
      {required && (
        <>
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
          <span className="sr-only"> ({t("common.required")})</span>
        </>
      )}
      {optional && !required && <span className="text-muted-foreground font-normal"> ({t("common.optional")})</span>}
    </Label>
  );
}
