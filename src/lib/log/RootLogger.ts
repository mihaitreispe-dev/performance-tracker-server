import { ConsoleLogger, ConsoleLoggerOptions, Injectable, Optional, Scope } from '@nestjs/common';
import { isString } from 'lodash';

export type RootLoggerOptions = ConsoleLoggerOptions & {
  /**
   * A prefix to be used for each log message.
   * Note: This option is not used when `json` is enabled.
   */
  prefix?: string;

  /**
   * The context of the logger.
   */
  context?: string;
};

@Injectable({ scope: Scope.TRANSIENT })
export class RootLogger extends ConsoleLogger {
  declare protected options: RootLoggerOptions;

  constructor();
  constructor(context: string);
  constructor(options: RootLoggerOptions);
  constructor(context: string, options: RootLoggerOptions);
  constructor(
    @Optional()
    contextOrOptions?: string | RootLoggerOptions,
    @Optional()
    options?: RootLoggerOptions,
  ) {
    const [context, opts] = isString(contextOrOptions)
      ? [contextOrOptions, options]
      : options
        ? [undefined, options]
        : [contextOrOptions?.context, contextOrOptions];
    if (!context) {
      if (opts) {
        super(opts.context ?? 'Nest', opts);
      } else {
        super();
      }
    } else {
      if (opts) {
        super(context, opts);
      } else {
        super(context);
      }
    }
  }

  protected formatPid(pid: number) {
    return `[${this.options.prefix}] ${pid} `;
  }

  protected getTimestamp() {
    return new Date().toISOString();
  }
}
