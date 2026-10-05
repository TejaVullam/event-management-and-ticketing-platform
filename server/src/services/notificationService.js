export async function sendBookingConfirmation(booking) {
  console.log(`booking confirmation queued: ${booking?.id || booking}`);
}
export async function sendBookingReminder(booking) {
  console.log(`booking reminder queued: ${booking?.id || booking}`);
}
