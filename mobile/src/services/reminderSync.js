/**
 * Reminder Sync Utility
 * 
 * Call this on app startup to:
 * 1. Clean up past reminders that already fired
 * 2. Re-schedule any notifications that got lost (edge case on some Android devices)
 * 3. Sync local DB with OS notification state
 */

import { 
  setupNotificationChannel, 
  syncRemindersWithOS, 
  setupForegroundHandler,
  setupBackgroundHandler,
} from './notifications';
import { 
  getReminders, 
  cleanupPastReminders, 
  updateReminderNotificationId 
} from '../database/db';
import { getStoredAuth } from './auth';

let isInitialized = false;
let foregroundUnsub = null;

/**
 * Initialize notification system on app startup
 * Should be called early in app lifecycle (e.g., in App.js or AppContext)
 */
export async function initializeNotifications() {
  if (isInitialized) {
    console.log('[ReminderSync] Already initialized, skipping');
    return;
  }
  
  try {
    // 1. Setup Android notification channel (required for Android 8+)
    await setupNotificationChannel();
    
    // 2. Setup foreground event handler
    foregroundUnsub = setupForegroundHandler();
    
    // 3. Setup background event handler (for notification taps when app is backgrounded)
    setupBackgroundHandler();
    
    isInitialized = true;
    console.log('[ReminderSync] Notification system initialized');
  } catch (error) {
    console.error('[ReminderSync] Failed to initialize notifications:', error);
  }
}

/**
 * Sync reminders for the current user
 * Should be called after user logs in or on app resume
 */
export async function syncUserReminders() {
  try {
    // Get current user
    const auth = await getStoredAuth();
    const userId = auth?.user?.id || auth?.user?.uid;
    
    if (!userId) {
      console.log('[ReminderSync] No user logged in, skipping sync');
      return { cleaned: 0, rescheduled: 0, total: 0 };
    }
    
    console.log('[ReminderSync] Starting sync for user:', userId);
    
    // 1. Clean up past reminders from database
    const cleanedCount = await cleanupPastReminders(userId);
    if (cleanedCount > 0) {
      console.log(`[ReminderSync] Cleaned ${cleanedCount} past reminders from DB`);
    }
    
    // 2. Get remaining active reminders
    const reminders = await getReminders(userId);
    console.log(`[ReminderSync] Found ${reminders.length} active reminders`);
    
    if (reminders.length === 0) {
      return { cleaned: cleanedCount, rescheduled: 0, total: 0 };
    }
    
    // 3. Sync with OS notifications
    const syncResult = await syncRemindersWithOS(reminders);
    
    console.log('[ReminderSync] Sync complete:', {
      cleaned: cleanedCount,
      rescheduled: syncResult.rescheduled,
      total: reminders.length,
    });
    
    return {
      cleaned: cleanedCount,
      rescheduled: syncResult.rescheduled,
      total: reminders.length,
    };
  } catch (error) {
    console.error('[ReminderSync] Sync failed:', error);
    return { cleaned: 0, rescheduled: 0, total: 0 };
  }
}

/**
 * Cleanup notification listeners on app unmount
 */
export function cleanupNotifications() {
  if (foregroundUnsub) {
    foregroundUnsub();
    foregroundUnsub = null;
  }
  isInitialized = false;
  console.log('[ReminderSync] Notification listeners cleaned up');
}
