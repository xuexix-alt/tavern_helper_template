async page => {
  const frameLocator = page.frameLocator('iframe[name="TH-message--0--0"]');
  await frameLocator.getByRole('button', { name: '改词重生' }).click();
  await frameLocator.getByRole('button', { name: '确认重生' }).click();
  await page.waitForTimeout(3000);
  return 'done';
}
