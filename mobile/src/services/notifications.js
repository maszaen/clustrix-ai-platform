/**
 * Notification Service - @notifee/react-native
 * 
 * Handles scheduled notifications for reminders.
 * Notifications are scheduled at OS level - they will fire even if app is killed.
 */

import notifee, { 
  TriggerType, 
  AndroidImportance, 
  AuthorizationStatus,
  RepeatFrequency,
} from '@notifee/react-native';
import { Platform } from 'react-native';

// ===================================================================
// CHANNEL SETUP (Android requires channels)
// ===================================================================

const REMINDER_CHANNEL_ID = 'clustrix-reminders';

/**
 * Create notification channel for Android
 * Must be called on app start
 */
export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Reminders',
      description: 'Scheduled reminders from Clustrix AI',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
    console.log('[Notifee] Reminder channel created');
  }
}

// ===================================================================
// PERMISSION HANDLING
// ===================================================================

/**
 * Check if notification permissions are granted
 * @returns {Promise<boolean>}
 */
export async function hasNotificationPermission() {
  const settings = await notifee.getNotificationSettings();
  return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
}

/**
 * Request notification permission
 * @returns {Promise<{granted: boolean, status: string}>}
 */
export async function requestNotificationPermission() {
  try {
    const settings = await notifee.requestPermission();
    
    const granted = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
    
    let status = 'unknown';
    switch (settings.authorizationStatus) {
      case AuthorizationStatus.AUTHORIZED:
        status = 'authorized';
        break;
      case AuthorizationStatus.DENIED:
        status = 'denied';
        break;
      case AuthorizationStatus.NOT_DETERMINED:
        status = 'not_determined';
        break;
      case AuthorizationStatus.PROVISIONAL:
        status = 'provisional';
        break;
    }
    
    console.log(`[Notifee] Permission status: ${status}`);
    return { granted, status };
  } catch (error) {
    console.error('[Notifee] Permission request failed:', error);
    return { granted: false, status: 'error' };
  }
}

// ===================================================================
// SCHEDULE NOTIFICATION
// ===================================================================

/**
 * Schedule a notification at a specific time
 * Uses OS-level scheduling - fires even if app is killed
 * 
 * @param {Object} params
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification body
 * @param {Date|string} params.scheduledDate - When to show notification (Date or ISO string)
 * @param {Object} [params.metadata] - Extra data to attach
 * @returns {Promise<{success: boolean, notificationId?: string, error?: string}>}
 */
export async function scheduleNotification({ title, message, scheduledDate, metadata = {} }) {
  try {
    // Ensure permission
    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      const { granted } = await requestNotificationPermission();
      if (!granted) {
        return { 
          success: false, 
          error: 'Notification permission denied. Please enable notifications in Settings.' 
        };
      }
    }
    
    // Parse date
    const triggerDate = typeof scheduledDate === 'string' 
      ? new Date(scheduledDate) 
      : scheduledDate;
    
    // Validate future date
    if (triggerDate.getTime() <= Date.now()) {
      return { 
        success: false, 
        error: 'Scheduled date must be in the future.' 
      };
    }
    
    // Create trigger
    const trigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: triggerDate.getTime(),
      alarmManager: {
        allowWhileIdle: true, // Fire even in Doze mode
      },
    };
    
    // Schedule notification
    const notificationId = await notifee.createTriggerNotification(
      {
        title,
        body: message,
        data: metadata,
        android: {
          channelId: REMINDER_CHANNEL_ID,
          pressAction: { id: 'default' },
          smallIcon: 'ic_notification', // Make sure this exists in android/app/src/main/res
        },
        ios: {
          sound: 'default',
        },
      },
      trigger
    );
    
    console.log(`[Notifee] Scheduled notification ${notificationId} for ${triggerDate.toISOString()}`);
    
    return { success: true, notificationId };
  } catch (error) {
    console.error('[Notifee] Schedule failed:', error);
    return { success: false, error: error.message };
  }
}

// ===================================================================
// CANCEL NOTIFICATION
// ===================================================================

/**
 * Cancel a scheduled notification by ID
 * @param {string} notificationId - The notification ID from scheduleNotification
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function cancelNotification(notificationId) {
  try {
    await notifee.cancelTriggerNotification(notificationId);
    console.log(`[Notifee] Cancelled notification ${notificationId}`);
    return { success: true };
  } catch (error) {
    console.error(`[Notifee] Cancel failed for ${notificationId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancel all scheduled notifications
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function cancelAllNotifications() {
  try {
    const triggers = await notifee.getTriggerNotificationIds();
    await notifee.cancelAllNotifications();
    console.log(`[Notifee] Cancelled ${triggers.length} notifications`);
    return { success: true, count: triggers.length };
  } catch (error) {
    console.error('[Notifee] Cancel all failed:', error);
    return { success: false, count: 0 };
  }
}

// ===================================================================
// SYNC UTILITIES - For app launch
// ===================================================================

/**
 * Get all scheduled notification IDs from OS
 * @returns {Promise<string[]>}
 */
export async function getScheduledNotificationIds() {
  try {
    return await notifee.getTriggerNotificationIds();
  } catch (error) {
    console.error('[Notifee] Get scheduled IDs failed:', error);
    return [];
  }
}

/**
 * Get pending trigger notifications with details
 * @returns {Promise<Array>}
 */
export async function getPendingNotifications() {
  try {
    return await notifee.getTriggerNotifications();
  } catch (error) {
    console.error('[Notifee] Get pending notifications failed:', error);
    return [];
  }
}

/**
 * Sync reminders with OS notifications on app launch
 * - Cleans up past reminders that already fired
 * - Re-schedules any that got lost (edge case on some Android devices)
 * 
 * @param {Array} reminders - Array of reminder objects from database
 * @returns {Promise<{cleaned: number, rescheduled: number}>}
 */
export async function syncRemindersWithOS(reminders = []) {
  const stats = { cleaned: 0, rescheduled: 0 };
  
  try {
    // Get currently scheduled notifications in OS
    const scheduledIds = new Set(await getScheduledNotificationIds());
    const now = Date.now();
    
    for (const reminder of reminders) {
      const scheduledTime = new Date(reminder.scheduledDate).getTime();
      
      // Skip already fired reminders (will be cleaned by caller)
      if (scheduledTime <= now) {
        stats.cleaned++;
        continue;
      }
      
      // Check if notification exists in OS
      if (!scheduledIds.has(reminder.notificationId)) {
        // Re-schedule lost notification
        console.log(`[Notifee] Re-scheduling lost reminder: ${reminder.id}`);
        
        const result = await scheduleNotification({
          title: reminder.title,
          message: reminder.message,
          scheduledDate: reminder.scheduledDate,
          metadata: { reminderId: reminder.id, ...reminder.metadata },
        });
        
        if (result.success) {
          stats.rescheduled++;
          // Note: The new notificationId should be updated in DB by caller
        }
      }
    }
    
    console.log(`[Notifee] Sync complete: ${stats.cleaned} past, ${stats.rescheduled} rescheduled`);
  } catch (error) {
    console.error('[Notifee] Sync failed:', error);
  }
  
  return stats;
}

// ===================================================================
// FOREGROUND EVENT HANDLING
// ===================================================================

/**
 * Setup foreground notification handling
 * Call this on app startup
 */
export function setupForegroundHandler() {
  return notifee.onForegroundEvent(({ type, detail }) => {
    console.log('[Notifee] Foreground event:', type, detail.notification?.id);
    // Can add custom handling here (e.g., refresh reminder list)
  });
}

/**
 * Setup background notification handling
 * Must be called at app root level (outside of components)
 */
export function setupBackgroundHandler() {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    console.log('[Notifee] Background event:', type, detail.notification?.id);
    // Background handling - can update app state if needed
  });
}
