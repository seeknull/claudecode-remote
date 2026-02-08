interface Props {
  open: boolean;
  onClose: () => void;
  settings: { permissionMode: string; model: string };
  onSettingsChange: (settings: Partial<{ permissionMode: string; model: string }>) => void;
}

const PERMISSION_MODES = [
  {
    value: "bypassPermissions",
    label: "Bypass Permissions",
    description: "Execute all tools without asking",
  },
  {
    value: "default",
    label: "Default",
    description: "Ask for approval on sensitive actions",
  },
  {
    value: "plan",
    label: "Plan Mode",
    description: "Analyze and plan without executing",
  },
];

const MODELS = [
  { value: "sonnet", label: "Claude Sonnet (Fast)" },
  { value: "opus", label: "Claude Opus (Powerful)" },
  { value: "haiku", label: "Claude Haiku (Quick)" },
];

export default function SettingsPanel({
  open,
  onClose,
  settings,
  onSettingsChange,
}: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-surface-light border-l border-gray-700/50 z-50 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Permission Mode */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Permission Mode
            </h3>
            <div className="space-y-2">
              {PERMISSION_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`flex items-start gap-3 p-3 rounded-md cursor-pointer border transition-colors ${
                    settings.permissionMode === mode.value
                      ? "bg-accent/10 border-accent/30"
                      : "bg-surface border-gray-700/50 hover:bg-surface-lighter"
                  }`}
                >
                  <input
                    type="radio"
                    name="permissionMode"
                    value={mode.value}
                    checked={settings.permissionMode === mode.value}
                    onChange={() =>
                      onSettingsChange({ permissionMode: mode.value })
                    }
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <div className="text-sm text-gray-200">{mode.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {mode.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Model */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Model
            </h3>
            <div className="space-y-2">
              {MODELS.map((model) => (
                <label
                  key={model.value}
                  className={`flex items-center gap-3 p-3 rounded-md cursor-pointer border transition-colors ${
                    settings.model === model.value
                      ? "bg-accent/10 border-accent/30"
                      : "bg-surface border-gray-700/50 hover:bg-surface-lighter"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.value}
                    checked={settings.model === model.value}
                    onChange={() =>
                      onSettingsChange({ model: model.value })
                    }
                    className="accent-accent"
                  />
                  <span className="text-sm text-gray-200">{model.label}</span>
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-4">
            Settings are applied on the next message you send.
          </p>
        </div>
      </div>
    </>
  );
}
