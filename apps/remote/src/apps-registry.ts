export type CuratedApp = {
  key: string;
  displayName: string;
  launchName: string;
  processName: string;
};

export const CURATED_APPS: CuratedApp[] = [
  { key: "slack", displayName: "Slack", launchName: "Slack", processName: "Slack" },
  { key: "ghostty", displayName: "Ghostty", launchName: "Ghostty", processName: "Ghostty" },
  { key: "zoom", displayName: "Zoom", launchName: "zoom.us", processName: "zoom.us" },
  { key: "postman", displayName: "Postman", launchName: "Postman", processName: "Postman" },
  {
    key: "sublime-merge",
    displayName: "Sublime Merge",
    launchName: "Sublime Merge",
    processName: "Sublime Merge",
  },
  { key: "arc", displayName: "Arc", launchName: "Arc", processName: "Arc" },
  { key: "notes", displayName: "Notes", launchName: "Notes", processName: "Notes" },
  {
    key: "mongodb-compass",
    displayName: "MongoDB Compass",
    launchName: "MongoDB Compass",
    processName: "MongoDB Compass",
  },
  { key: "hiddify", displayName: "Hiddify", launchName: "Hiddify", processName: "Hiddify" },
];
