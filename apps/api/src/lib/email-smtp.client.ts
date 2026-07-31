import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { connect as netConnect, type Socket } from 'node:net';

export class EmailSmtpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EmailSmtpError';
  }
}

type EmailSmtpClientOptions = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export class EmailSmtpClient {
  private readonly host: string;
  private readonly port: number;
  private readonly secure: boolean;
  private readonly username: string;
  private readonly password: string;

  constructor(options: EmailSmtpClientOptions) {
    this.host = options.host.trim();
    this.port = options.port;
    this.secure = options.secure;
    this.username = options.username.trim();
    this.password = options.password;
  }

  async testConnection(): Promise<void> {
    await this.runSmtpSession(async (session) => {
      await session.ehlo(this.host, this.secure);
      await session.authenticate(this.username, this.password);
    });
  }

  private async runSmtpSession(run: (session: SmtpSession) => Promise<void>): Promise<void> {
    let socket = await this.openSocket();
    const session = new SmtpSession(socket);

    try {
      await session.readGreeting();
      await run(session);
      await session.quit();
    } finally {
      socket.end();
    }
  }

  private openSocket(): Promise<Socket | TLSSocket> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        reject(new EmailSmtpError('NETWORK_ERROR', error.message || 'Unable to reach SMTP server'));
      };

      if (this.secure) {
        const socket = tlsConnect(
          {
            host: this.host,
            port: this.port,
            servername: this.host,
          },
          () => resolve(socket),
        );

        socket.setTimeout(15000, () => {
          socket.destroy(new EmailSmtpError('TIMEOUT', 'SMTP connection timed out'));
        });
        socket.on('error', onError);
        return;
      }

      const socket = netConnect(
        {
          host: this.host,
          port: this.port,
        },
        () => resolve(socket),
      );

      socket.setTimeout(15000, () => {
        socket.destroy(new EmailSmtpError('TIMEOUT', 'SMTP connection timed out'));
      });
      socket.on('error', onError);
    });
  }
}

class SmtpSession {
  private buffer = '';

  constructor(private socket: Socket | TLSSocket) {
    this.socket.setEncoding('utf8');
  }

  async readGreeting(): Promise<void> {
    const response = await this.readResponse();

    if (!response.startsWith('220')) {
      throw new EmailSmtpError('PROTOCOL_ERROR', `Unexpected SMTP greeting: ${response}`);
    }
  }

  async ehlo(host: string, secure: boolean): Promise<void> {
    let response = await this.sendCommand('EHLO titan-aura.local');

    if (!response.startsWith('250') && !response.includes('\n250')) {
      response = await this.sendCommand('HELO titan-aura.local');

      if (!response.startsWith('250')) {
        throw new EmailSmtpError('PROTOCOL_ERROR', `SMTP EHLO/HELO failed: ${response}`);
      }

      return;
    }

    if (!secure && response.toUpperCase().includes('STARTTLS')) {
      const startTlsResponse = await this.sendCommand('STARTTLS');

      if (!startTlsResponse.startsWith('220')) {
        throw new EmailSmtpError('PROTOCOL_ERROR', `SMTP STARTTLS failed: ${startTlsResponse}`);
      }

      this.socket = await upgradeSocketToTls(this.socket, host);
      response = await this.sendCommand('EHLO titan-aura.local');

      if (!response.startsWith('250') && !response.includes('\n250')) {
        throw new EmailSmtpError('PROTOCOL_ERROR', `SMTP EHLO after STARTTLS failed: ${response}`);
      }
    }
  }

  async authenticate(username: string, password: string): Promise<void> {
    const authPrompt = await this.sendCommand('AUTH LOGIN');

    if (!authPrompt.startsWith('334')) {
      throw new EmailSmtpError(
        'AUTH_FAILED',
        `SMTP server does not support AUTH LOGIN: ${authPrompt}`,
      );
    }

    const usernameResponse = await this.sendCommand(
      Buffer.from(username, 'utf8').toString('base64'),
    );

    if (!usernameResponse.startsWith('334')) {
      throw new EmailSmtpError('AUTH_FAILED', `SMTP username rejected: ${usernameResponse}`);
    }

    const passwordResponse = await this.sendCommand(
      Buffer.from(password, 'utf8').toString('base64'),
    );

    if (!passwordResponse.startsWith('235')) {
      throw new EmailSmtpError('AUTH_FAILED', 'SMTP server rejected the provided credentials');
    }
  }

  async quit(): Promise<void> {
    await this.sendCommand('QUIT');
  }

  private sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        this.buffer += chunk;

        const lines = this.buffer.split(/\r?\n/).filter(Boolean);

        if (lines.length === 0) {
          return;
        }

        const lastLine = lines[lines.length - 1]!;
        const isComplete = /^\d{3}(?: |$)/.test(lastLine) && lastLine[3] === ' ';

        if (!isComplete) {
          return;
        }

        cleanup();
        resolve(lines.join('\n'));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new EmailSmtpError('NETWORK_ERROR', error.message));
      };

      const cleanup = () => {
        this.socket.off('data', onData);
        this.socket.off('error', onError);
      };

      this.socket.on('data', onData);
      this.socket.on('error', onError);
      this.socket.write(`${command}\r\n`);
    });
  }

  private readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        this.buffer += chunk;

        const lines = this.buffer.split(/\r?\n/).filter(Boolean);

        if (lines.length === 0) {
          return;
        }

        const lastLine = lines[lines.length - 1]!;
        const isComplete = /^\d{3}(?: |$)/.test(lastLine) && lastLine[3] === ' ';

        if (!isComplete) {
          return;
        }

        cleanup();
        resolve(lines.join('\n'));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new EmailSmtpError('NETWORK_ERROR', error.message));
      };

      const cleanup = () => {
        this.socket.off('data', onData);
        this.socket.off('error', onError);
      };

      this.socket.on('data', onData);
      this.socket.on('error', onError);
    });
  }
}

function upgradeSocketToTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tlsConnect(
      {
        socket,
        servername: host,
      },
      () => resolve(tlsSocket),
    );

    tlsSocket.on('error', (error) => {
      reject(new EmailSmtpError('NETWORK_ERROR', error.message));
    });
  });
}
