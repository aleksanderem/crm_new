import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/dashboard/form-editor")({
  component: FormEditorLayout,
});

/**
 * Full-screen layout for the document template editor.
 * Uses fixed positioning to cover the entire viewport (including the sidebar),
 * giving the PDFme Designer maximum working space — like a dedicated design tool.
 */
function FormEditorLayout() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <Outlet />
    </div>
  );
}
