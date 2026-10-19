// "Request a quote" on a Pro trader's page: its fields, limits and messages. Client-safe and light (no zod, no
// phone library): the form imports it. The server checks with lib/job-request-parse.ts; the database
// (submit_job_request) checks the same rules again.

export const JOB_LIMITS = {
  name: 60,
  phone: 20,
  email: 254,
  body: 1000,
} as const;

export const JOB_BODY_MIN = 10;

export const JOB_FIELDS = ["name", "phone", "email", "district", "body"] as const;

export type JobRequest = {
  name: string;
  phone_e164: string;
  email: string | null;
  district: string;
  body: string;
};

export type JobFormState = {
  errors?: Partial<Record<(typeof JOB_FIELDS)[number], string>>;
  message?: string;
  values?: Record<string, string>;
};

export const JOB_ERRORS = {
  name: "Enter your name, in 2 to 60 characters.",
  phone: "Enter a UK mobile or landline number, like 07700 900123.",
  email: "Enter an email address like name@example.com, or leave it empty.",
  district: "Choose your area.",
  body: "Describe the job in 10 to 1,000 characters.",
  captcha: "We couldn't check you're not a robot. Please try again.",
  limited: "You've already sent this trader a request today. They'll be in touch, or you can call them from their page.",
  unavailable: "This trader isn't taking requests through the site right now. You can still call them from their page.",
  failed: "Something went wrong. Please try again, or call them from their page.",
} as const;

export const JOB_STATUSES = ["new", "contacted", "won", "lost", "spam"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_TEXT: Record<JobStatus, string> = {
  new: "New",
  contacted: "Contacted",
  won: "Won",
  lost: "Didn't go ahead",
  spam: "Spam",
};

export const sentPath = (slug: string) => `/platform/p/${slug}/request/sent`;
