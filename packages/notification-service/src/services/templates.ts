import Handlebars from 'handlebars';

// Simple registry of templates per event type
const templates: Record<string, { title: string; body: string }> = {
  'task.assigned': {
    title: 'Task Assigned',
    body: 'You have been assigned to task {{taskTitle}}.',
  },
  'task.updated': {
    title: 'Task Updated',
    body: 'Task {{taskTitle}} has been updated.',
  },
  'message.new': {
    title: 'New Message',
    body: '{{fromName}}: {{snippet}}',
  },
  'safety.checkin': {
    title: 'Safety Check-In',
    body: 'Please confirm you are safe during task {{taskTitle}}.',
  },
  'emergency.alert': {
    title: 'Emergency Alert',
    body: 'Emergency reported by {{userName}} at {{location}}',
  },
};

export function renderTemplate(eventType: string, data: Record<string, any>) {
  const t = templates[eventType] || { title: 'Notification', body: '{{message}}' };
  const title = Handlebars.compile(t.title)(data);
  const body = Handlebars.compile(t.body)(data);
  return { title, body };
}
