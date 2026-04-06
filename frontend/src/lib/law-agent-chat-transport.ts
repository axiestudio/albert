import type { UIMessage } from "ai";
import type { RateLimitedChatTransportOptions } from "./rate-limited-transport";
import { RateLimitedChatTransport } from "./rate-limited-transport";

type LawAgentChatTransportOptions<T extends UIMessage = UIMessage> = RateLimitedChatTransportOptions<T> & {
  configurationErrorMessage?: string;
  onConfigurationRequired?: () => void;
  requiresConfiguration?: boolean;
};

export class LawAgentChatTransport<T extends UIMessage = UIMessage> extends RateLimitedChatTransport<T> {
  private configurationErrorMessage: string;
  private onConfigurationRequired?: () => void;
  private requiresConfiguration: boolean;

  constructor(options: LawAgentChatTransportOptions<T>) {
    super(options);
    this.configurationErrorMessage = options.configurationErrorMessage
      ?? "Configure the selected provider before sending messages.";
    this.onConfigurationRequired = options.onConfigurationRequired;
    this.requiresConfiguration = options.requiresConfiguration ?? false;
  }

  override async sendMessages(
    options: Parameters<RateLimitedChatTransport<T>["sendMessages"]>[0],
  ) {
    if (this.requiresConfiguration) {
      this.onConfigurationRequired?.();
      throw new Error(this.configurationErrorMessage);
    }

    return super.sendMessages(options);
  }
}