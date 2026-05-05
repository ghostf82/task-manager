"use client";

import { useEffect } from "react";

type Props = {
  formId: string;
};

export function FormSubmitGuard({ formId }: Props) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const onSubmitCapture = (event: Event) => {
      const submitEvent = event as SubmitEvent;
      const hasSubmitter = Boolean(submitEvent.submitter);
      if (!hasSubmitter) {
        event.preventDefault();
      }
    };

    form.addEventListener("submit", onSubmitCapture, true);
    return () => form.removeEventListener("submit", onSubmitCapture, true);
  }, [formId]);

  return null;
}
