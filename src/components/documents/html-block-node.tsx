import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { cn } from "@/lib/utils";
import { Code, Eye, EyeOff, AtSign, FormInput, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FormFieldType } from "@/components/documents/form-field-node";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { EditorState } from "@codemirror/state";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { variableListRef } from "@/components/gabinet/variable-mention";
import { CATEGORY_LABELS } from "@/lib/document-variables";

// ---------------------------------------------------------------------------
// CodeMirror completion — triggers on {{ like the TipTap editor
// ---------------------------------------------------------------------------

function variableCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const match = context.matchBefore(/\{\{[\w.]*$/);
  if (!match) return null;

  const variables = variableListRef.current;
  if (!variables.length) return null;

  return {
    from: match.from,
    options: variables.map((v) => ({
      label: `{{${v.key}}}`,
      displayLabel: v.label,
      detail: `@${v.key}`,
      apply: `<span data-variable="${v.key}">{{${v.key}}}</span>`,
    })),
    filter: true,
  };
}

// ---------------------------------------------------------------------------
// React NodeView — CodeMirror editor + live preview toggle
// ---------------------------------------------------------------------------

const cmExtensions = [
  html(),
  EditorState.languageData.of(() => [
    { autocomplete: variableCompletionSource },
  ]),
];

function HtmlBlockNodeView({
  node,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const content = (node.attrs.content as string) || "";

  const onChange = useCallback(
    (val: string) => updateAttributes({ content: val }),
    [updateAttributes],
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      const view = cmRef.current?.view;
      if (view) {
        const cursor = view.state.selection.main.head;
        view.dispatch({
          changes: { from: cursor, insert: text },
        });
        view.focus();
      } else {
        // Fallback: append to content
        updateAttributes({ content: content + text });
      }
    },
    [content, updateAttributes],
  );

  const insertVariable = useCallback(
    (key: string) => {
      insertAtCursor(`<span data-variable="${key}">{{${key}}}</span>`);
      setVarsOpen(false);
    },
    [insertAtCursor],
  );

  const [fieldOpen, setFieldOpen] = useState(false);
  const [fieldId, setFieldId] = useState("");
  const [fieldLabel, setFieldLabel] = useState("Pole");
  const [fieldType, setFieldType] = useState<FormFieldType>("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldPlaceholder, setFieldPlaceholder] = useState("");
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  const insertFormField = useCallback(() => {
    const id = fieldId || `field_${crypto.randomUUID().slice(0, 8)}`;
    const attrs = [
      `data-form-field="${id}"`,
      `data-field-type="${fieldType}"`,
      fieldRequired ? `data-required="true"` : "",
      fieldPlaceholder ? `data-placeholder="${fieldPlaceholder}"` : "",
      fieldOptions ? `data-options="${fieldOptions}"` : "",
      `label="${fieldLabel}"`,
    ]
      .filter(Boolean)
      .join(" ");
    insertAtCursor(`<span ${attrs}>[${fieldLabel}]</span>`);
    setFieldOpen(false);
    setFieldId("");
    setFieldLabel("Pole");
    setFieldType("text");
    setFieldRequired(false);
    setFieldOptions("");
    setFieldPlaceholder("");
  }, [insertAtCursor, fieldId, fieldLabel, fieldType, fieldRequired, fieldOptions, fieldPlaceholder]);

  const variables = variableListRef.current;

  return (
    <NodeViewWrapper className="my-2">
      <div
        className={cn(
          "overflow-hidden rounded-md border",
          "border-violet-300",
          selected && "ring-2 ring-primary",
        )}
      >
        {/* Header bar */}
        <div className="flex items-center gap-1.5 border-b bg-violet-50 px-3 py-1.5">
          <Code className="h-3.5 w-3.5 text-violet-600" />
          <span className="text-xs font-medium text-violet-700">
            HTML / CSS
          </span>

          <div className="ml-auto flex items-center gap-1">
            {/* Insert variable */}
            {!preview && variables.length > 0 && (
              <Popover open={varsOpen} onOpenChange={setVarsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                  >
                    <AtSign className="mr-1 h-3 w-3" />
                    Zmienna
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="max-h-64 w-60 overflow-auto p-1"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  {variables.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                      onClick={() => insertVariable(v.key)}
                    >
                      <span className="truncate font-medium">{v.label}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        @{v.key}
                      </span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            {/* Insert form field */}
            {!preview && (
              <Popover open={fieldOpen} onOpenChange={setFieldOpen} modal>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                  >
                    <FormInput className="mr-1 h-3 w-3" />
                    Pole
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="grid gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <div className="flex gap-1">
                        <Input
                          value={fieldLabel}
                          onChange={(e) => setFieldLabel(e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Nazwa pola..."
                        />
                        <Popover open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 shrink-0 p-0"
                              title={t("documentsEditor.htmlBlock.linkEntityField")}
                            >
                              <Database className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="max-h-72 w-64 overflow-auto p-1"
                            side="right"
                            align="start"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                          >
                            {(() => {
                              const grouped = new Map<string, typeof variables>();
                              for (const v of variables) {
                                const list = grouped.get(v.category) ?? [];
                                list.push(v);
                                grouped.set(v.category, list);
                              }
                              return Array.from(grouped.entries()).map(([cat, items]) => (
                                <div key={cat}>
                                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {CATEGORY_LABELS[cat]?.pl ?? cat}
                                  </div>
                                  {items.map((v) => (
                                    <button
                                      key={v.key}
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                                      onClick={() => {
                                        setFieldLabel(v.label);
                                        setFieldId(v.key);
                                        setLinkPickerOpen(false);
                                      }}
                                    >
                                      <span className="truncate font-medium">{v.label}</span>
                                      <span className="ml-auto shrink-0 text-muted-foreground">
                                        {v.key}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ));
                            })()}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Field ID</Label>
                      <Input
                        value={fieldId}
                        onChange={(e) => setFieldId(e.target.value)}
                        className="h-8 font-mono text-xs"
                        placeholder={t("documentsEditor.htmlBlock.fieldIdPlaceholder")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Typ</Label>
                      <Select
                        value={fieldType}
                        onValueChange={(v) => setFieldType(v as FormFieldType)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Tekst</SelectItem>
                          <SelectItem value="textarea">Wieloliniowy</SelectItem>
                          <SelectItem value="select">Lista wyboru</SelectItem>
                          <SelectItem value="date">Data</SelectItem>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {fieldType === "select" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Opcje (po przecinku)</Label>
                        <Input
                          value={fieldOptions}
                          onChange={(e) => setFieldOptions(e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Opcja A, Opcja B, Opcja C"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Placeholder</Label>
                      <Input
                        value={fieldPlaceholder}
                        onChange={(e) => setFieldPlaceholder(e.target.value)}
                        className="h-8 text-sm"
                        placeholder={t("documentsEditor.htmlBlock.hintPlaceholder")}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Wymagane</Label>
                      <Switch
                        checked={fieldRequired}
                        onCheckedChange={setFieldRequired}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={insertFormField}
                      className="w-full"
                    >
                      Wstaw pole
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Preview toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setPreview(!preview)}
            >
              {preview ? (
                <EyeOff className="mr-1 h-3 w-3" />
              ) : (
                <Eye className="mr-1 h-3 w-3" />
              )}
              {preview ? t("documentsEditor.htmlBlock.code") : t("documentsEditor.htmlBlock.preview")}
            </Button>
          </div>
        </div>

        {/* Content */}
        {preview ? (
          <div
            className="prose prose-sm max-w-none p-3 bg-white text-gray-900 [&_*]:!text-gray-900 [&_a]:!text-blue-700"
            dangerouslySetInnerHTML={{
              __html: `<style>
[data-variable]{display:inline-flex;align-items:center;border-radius:4px;background:hsl(var(--accent));padding:2px 6px;font-family:ui-monospace,monospace;font-size:12px;color:hsl(var(--accent-foreground))}
[data-form-field]{display:inline-flex;align-items:center;gap:4px;border-radius:4px;border:1px dashed #fdba74;background:#fff7ed;padding:2px 8px;font-size:12px;color:#c2410c}
[data-form-field]::before{content:attr(data-field-type);text-transform:uppercase;font-size:9px;font-weight:600;letter-spacing:.03em;background:#fed7aa;color:#9a3412;border-radius:2px;padding:0 4px}
</style>${content}`,
            }}
          />
        ) : (
          <CodeMirror
            ref={cmRef}
            value={content}
            onChange={onChange}
            extensions={cmExtensions}
            theme="light"
            minHeight="132px"
            maxHeight="400px"
            placeholder={t("documentsEditor.htmlBlock.htmlPlaceholder")}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              indentOnInput: true,
            }}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// TipTap Node extension
// ---------------------------------------------------------------------------

export const HtmlBlockNode = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      content: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-html-block": "true",
        "data-content": HTMLAttributes.content,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockNodeView);
  },

  addCommands() {
    return {
      insertHtmlBlock:
        (content?: string) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: { content: content || "" },
            })
            .run();
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    htmlBlock: {
      insertHtmlBlock: (content?: string) => ReturnType;
    };
  }
}
