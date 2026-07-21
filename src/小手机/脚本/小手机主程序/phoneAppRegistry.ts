export interface PhoneApp {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
}

export function upsertPhoneApp(apps: PhoneApp[], app: PhoneApp): void {
  const index = apps.findIndex(item => item.id === app.id);
  if (index === -1) {
    apps.push(app);
  } else {
    apps.splice(index, 1, app);
  }
  apps.sort((left, right) => left.order - right.order);
}
