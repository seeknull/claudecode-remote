interface Props {
  model: string;
  permissionMode: string;
  wsConnected: boolean;
  isStreaming: boolean;
}

export default function StatusBar({
  model,
  permissionMode,
  wsConnected,
  isStreaming,
}: Props) {
  return (
    <div className="border-t border-gray-700/50 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {wsConnected ? "Connected" : "Disconnected"}
        </span>
        {isStreaming && (
          <span className="text-accent flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            Processing
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span>Model: {model}</span>
        <span className="capitalize">
          Mode: {permissionMode === "bypassPermissions" ? "bypass" : permissionMode}
        </span>
      </div>
    </div>
  );
}
