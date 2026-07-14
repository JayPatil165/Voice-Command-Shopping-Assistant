"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// This wrapper is needed in Next.js 15 / React 19 to properly hydrate the client component
// and avoid the "Encountered a script tag while rendering React component" warning.
export function ThemeProvider({ 
  children, 
  ...props 
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
