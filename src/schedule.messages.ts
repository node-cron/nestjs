export const NO_SCHEDULER_FOUND = (schedulerName: string, name?: string) =>
  name
    ? `No ${schedulerName} was found with the given name (${name}). Check that you created one with a decorator or with the create API.`
    : `No ${schedulerName} was found. Check your configuration.`;

export const DUPLICATE_SCHEDULER = (schedulerName: string, name: string) =>
  `${schedulerName} with the given name (${name}) already exists.`;

export const DISTRIBUTED_REQUIRES_NAME = (key: string) =>
  `Cron job "${key}" is marked \`distributed: true\` but has no \`name\`. ` +
  `A stable name is required: it is the coordination key shared across instances.`;
