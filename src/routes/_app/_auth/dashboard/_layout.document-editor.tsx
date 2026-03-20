import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/document-editor")({
  component: DocumentEditorLayout,
});

/**
 * Full-screen layout for the document template editor (TipTap-based).
 * Same pattern as form-editor — fixed overlay covering sidebar for max workspace.
 */
function DocumentEditorLayout() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <Outlet />
    </div>
  );
}
