import { Component, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

type AuraMessageContentProps = {
  content: string;
  role: 'user' | 'assistant' | 'system';
};

const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
  },
};

type AuraMessageContentState = {
  renderFailed: boolean;
};

export class AuraMessageContent extends Component<
  AuraMessageContentProps,
  AuraMessageContentState
> {
  state: AuraMessageContentState = { renderFailed: false };

  static getDerivedStateFromError(): AuraMessageContentState {
    return { renderFailed: true };
  }

  render(): ReactNode {
    const { content, role } = this.props;

    if (role !== 'assistant' || this.state.renderFailed) {
      return <p className="aura-message__plain">{content}</p>;
    }

    return (
      <div className="aura-message__markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeSanitize, markdownSchema]]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            pre: ({ children }) => <pre className="aura-message__code-block">{children}</pre>,
            code: ({ className, children }) =>
              className ? (
                <code className={className}>{children}</code>
              ) : (
                <code className="aura-message__inline-code">{children}</code>
              ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }
}
