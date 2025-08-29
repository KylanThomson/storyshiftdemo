'use client';

interface CodeBlockProps {
  node: any;
  inline: boolean;
  className: string;
  children: any;
}

export function CodeBlock({
  node,
  inline,
  className,
  children,
  ...props
}: CodeBlockProps) {
  if (!inline) {
    return (
      <div className="not-prose flex flex-col">
        <pre
          {...props}
          className={`code-glass text-sm w-full overflow-x-auto p-4 rounded-2xl text-foreground brand-glow brand-border-accent`}
        >
          <code className="whitespace-pre-wrap break-words">{children}</code>
        </pre>
      </div>
    );
  } else {
    return (
      <code
        className={`${className} code-inline text-[0.95em] brand-border-accent`}
        {...props}
      >
        {children}
      </code>
    );
  }
}
