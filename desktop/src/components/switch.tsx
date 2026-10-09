"use client";
import type { ComponentProps } from "react";

// Native input retains Space, disabled, checked, and Shift-click behavior.
export function Switch(props:Omit<ComponentProps<"input">,"type"|"role">) {
  return <span className="app-switch"><input {...props} type="checkbox" role="switch"/><span className="switch-track" aria-hidden="true"><span className="switch-thumb"/></span></span>;
}
