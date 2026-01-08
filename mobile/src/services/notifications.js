/**
 * Notification Service - expo-notifications
 * 
 * Handles scheduled notifications for reminders.
 * Notifications are scheduled at OS level - they will fire even if app is killed.
 * 
 * Migrated from @notifee/react-native to expo-notifications for better Expo compatibility.
 */

import * as Notifications from 'expo-notifications';
import { Platform, Linking } from 'react-native';

// ===================================================================
// NOTIFICATION HANDLER SETUP
// ===================================================================

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Reminders',
      description: 'Scheduled reminders from Clustrix AI',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
    console.log('[Notifications] Reminder channel created');
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
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Request notification permission
 * @returns {Promise<{granted: boolean, status: string}>}
 */
export async function requestNotificationPermission() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    let finalStatus = existingStatus;
    
    // Only ask if not already determined
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    const granted = finalStatus === 'granted';
    
    console.log(`[Notifications] Permission status: ${finalStatus}`);
    return { granted, status: finalStatus };
  } catch (error) {
    console.error('[Notifications] Permission request failed:', error);
    return { granted: false, status: 'error' };
  }
}

// ===================================================================
// EXACT ALARM PERMISSION (Android 12+)
// ===================================================================

/**
 * Check if exact alarms can be scheduled (Android 12+)
 * expo-notifications handles this internally, but we provide this for UI checks
 * @returns {Promise<boolean>}
 */
export async function canScheduleExactAlarms() {
  if (Platform.OS !== 'android') {
    return true; // iOS doesn't have this restriction
  }
  
  // expo-notifications automatically uses inexact alarms if exact alarms aren't available
  // For Android 12+, the OS will still deliver notifications, just not at exact times
  // We return true because expo-notifications handles the fallback gracefully
  return true;
}

/**
 * Open alarm permission settings (Android 12+)
 * This opens the app settings where user can enable exact alarms
 */
export async function openAlarmPermissionSettings() {
  if (Platform.OS === 'android') {
    try {
      // Open app settings - user can enable "Alarms & reminders" permission there
      await Linking.openSettings();
    } catch (error) {
      console.error('[Notifications] Failed to open settings:', error);
    }
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
    
    // Calculate seconds until trigger (for logging)
    const secondsUntilTrigger = Math.floor((triggerDate.getTime() - Date.now()) / 1000);
    
    // Use seconds-based trigger for more precision on short delays
    // DATE trigger can have slight delays on some Android versions
    const triggerConfig = secondsUntilTrigger < 3600 
      ? {
          // For notifications < 1 hour away, use seconds trigger (more precise)
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, secondsUntilTrigger),
        }
      : {
          // For notifications > 1 hour away, use date trigger
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        };
    
    // Schedule notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        data: metadata,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        // Android specific
        ...(Platform.OS === 'android' && {
          channelId: REMINDER_CHANNEL_ID,
        }),
      },
      trigger: triggerConfig,
    });
    
    console.log(`[Notifications] Scheduled notification ${notificationId} for ${triggerDate.toISOString()} (in ${secondsUntilTrigger}s)`);
    
    return { success: true, notificationId };
  } catch (error) {
    console.error('[Notifications] Schedule failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Display an immediate test notification
 * Useful for debugging permissions/channels
 */
export async function displayTestNotification() {
  try {
    // Ensure permission first
    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      const { granted } = await requestNotificationPermission();
      if (!granted) {
        console.warn('[Notifications] Cannot display test notification - permission denied');
        return false;
      }
    }
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test Notification',
        body: 'Notifications are working correctly! 🚀',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && {
          channelId: REMINDER_CHANNEL_ID,
        }),
      },
      trigger: null, // null = immediate
    });
    
    console.log('[Notifications] Test notification displayed');
    return true;
  } catch (error) {
    console.error('[Notifications] Test notification failed:', error);
    return false;
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
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`[Notifications] Cancelled notification ${notificationId}`);
    return { success: true };
  } catch (error) {
    console.error(`[Notifications] Cancel failed for ${notificationId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancel all scheduled notifications
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function cancelAllNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const count = scheduled.length;
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log(`[Notifications] Cancelled ${count} notifications`);
    return { success: true, count };
  } catch (error) {
    console.error('[Notifications] Cancel all failed:', error);
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
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map(n => n.identifier);
  } catch (error) {
    console.error('[Notifications] Get scheduled IDs failed:', error);
    return [];
  }
}

/**
 * Get pending trigger notifications with details
 * @returns {Promise<Array>}
 */
export async function getPendingNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('[Notifications] Get pending notifications failed:', error);
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
        console.log(`[Notifications] Re-scheduling lost reminder: ${reminder.id}`);
        
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
    
    console.log(`[Notifications] Sync complete: ${stats.cleaned} past, ${stats.rescheduled} rescheduled`);
  } catch (error) {
    console.error('[Notifications] Sync failed:', error);
  }
  
  return stats;
}

// ===================================================================
// FOREGROUND EVENT HANDLING
// ===================================================================

// Store subscription references for cleanup
let foregroundSubscription = null;
let responseSubscription = null;

/**
 * Setup foreground notification handling
 * Call this on app startup
 * @returns {Function} Cleanup function to remove listener
 */
export function setupForegroundHandler() {
  // Handle notifications received while app is in foreground
  foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
    console.log('[Notifications] Foreground event:', notification.request.identifier);
    // Can add custom handling here (e.g., refresh reminder list)
  });
  
  // Return cleanup function (compatible with previous notifee API)
  return () => {
    if (foregroundSubscription) {
      foregroundSubscription.remove();
      foregroundSubscription = null;
    }
  };
}

/**
 * Setup background notification handling
 * Handles when user taps on notification
 */
export function setupBackgroundHandler() {
  // Handle notification response (user tapped notification)
  responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('[Notifications] Background event (tap):', response.notification.request.identifier);
    // Can add custom handling here (e.g., navigate to specific screen)
  });
  
  // Note: Unlike notifee, expo-notifications doesn't require registering background handler
  // at app root level. The OS handles background delivery automatically.
}

/**
 * Cleanup notification listeners
 * Call this on app unmount
 */
export function cleanupHandlers() {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  if (responseSubscription) {
    responseSubscription.remove();
    responseSubscription = null;
  }
  console.log('[Notifications] Handlers cleaned up');
}
