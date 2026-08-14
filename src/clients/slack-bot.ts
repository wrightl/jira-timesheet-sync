import { WebClient, type WebAPICallResult } from "@slack/web-api";

export interface SlackUser {
  id: string;
  name?: string;
  email?: string;
  realName?: string;
}

export interface SlackBotClient {
  sendDirectMessage(userId: string, text: string): Promise<void>;
  findUserByEmail(email: string): Promise<SlackUser | null>;
}

interface UsersLookupByEmailResult extends WebAPICallResult {
  user?: {
    id: string;
    name?: string;
    profile?: {
      email?: string;
      real_name?: string;
    };
  };
}

interface ChatPostMessageResult extends WebAPICallResult {
  ts?: string;
  channel?: string;
}

export class SlackBotHttpClient implements SlackBotClient {
  private readonly client: WebClient;

  constructor(options: { botToken: string }) {
    this.client = new WebClient(options.botToken);
  }

  async findUserByEmail(email: string): Promise<SlackUser | null> {
    try {
      const result = (await this.client.users.lookupByEmail({
        email,
      })) as UsersLookupByEmailResult;

      if (!result.ok || !result.user) {
        return null;
      }

      return {
        id: result.user.id,
        name: result.user.name,
        email: result.user.profile?.email,
        realName: result.user.profile?.real_name,
      };
    } catch (err) {
      return null;
    }
  }

  async sendDirectMessage(userId: string, text: string): Promise<void> {
    const result = (await this.client.chat.postMessage({
      channel: userId,
      text,
    })) as ChatPostMessageResult;

    if (!result.ok) {
      throw new Error("Failed to send Slack DM");
    }
  }
}

export function createSlackBotClient(options: {
  botToken: string;
}): SlackBotClient {
  return new SlackBotHttpClient(options);
}
