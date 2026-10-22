import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error?: Error;
}

export class PluginErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  State
> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Plugin UI failed", this.props.label ?? "plugin", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-[var(--error)]/40 bg-[var(--error-soft)] p-3 text-[11px] text-[var(--error)]">
          {this.props.label ?? "Plugin"} failed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
