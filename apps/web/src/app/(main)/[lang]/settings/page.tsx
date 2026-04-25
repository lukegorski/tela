"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import SettingsMenu from "@/components/SettingsMenu";

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsMenu />
    </ProtectedRoute>
  );
}
