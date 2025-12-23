/**
 * Account Screen
 * Shows login options or logged-in user profile with backup controls
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import SlideLeftModal from '../components/SlideLeftModal';
import AlertModal from '../components/AlertModal';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import GoogleLogo from '../../assets/cloud-database.png';
import { GOOGLE_FAVICON } from '../constants/strings';

export default function AccountScreen({ visible, onClose }) {
  const {
    currentUser,
    isLoggedIn,
    lastBackupTime,
    isBackingUp,
    loginWithGoogle,
    logout,
    backupNow,
    restoreBackup,
    sessions,
    cloudBackupInfo,
    backupHistory,
  } = useApp();
  
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Alert modal states
  const [alert, setAlert] = useState({
    visible: false,
    type: 'info', // 'success', 'error', 'confirm-logout', 'confirm-restore'
    title: '',
    message: '',
  });
  
  const showAlert = (type, title, message) => {
    setAlert({ visible: true, type, title, message });
  };
  
  const hideAlert = () => {
    setAlert(prev => ({ ...prev, visible: false }));
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        showAlert('error', 'Login Failed', result.error || 'Failed to login with Google');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    showAlert('confirm-logout', 'Logout', 'Are you sure you want to logout?');
  };
  
  const confirmLogout = async () => {
    hideAlert();
    await logout();
  };

  const handleBackup = async () => {
    const result = await backupNow();
    if (result.success) {
      showAlert('success', 'Backup Complete', 'Your data has been backed up to the cloud.');
    } else {
      showAlert('error', 'Backup Failed', result.error || 'Failed to backup data');
    }
  };

  const handleRestore = () => {
    showAlert('confirm-restore', 'Restore Backup', 'This will replace all your data with the cloud backup. Are you sure?');
  };
  
  const confirmRestore = async () => {
    hideAlert();
    const result = await restoreBackup();
    if (result.success) {
      if (result.notFound) {
        showAlert('warning', 'No Backup Found', 'No cloud backup was found for your account.');
      } else {
        showAlert('success', 'Restore Complete', 'Your data has been restored from the cloud.');
      }
    } else {
      showAlert('error', 'Restore Failed', result.error || 'Failed to restore data');
    }
  };

  const formatBackupTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return date.toLocaleDateString();
  };

  // Calculate usage stats
  const totalChats = sessions?.length || 0;
  
  // Count synced sessions (sessions that were updated before or at last backup time)
  const syncedChats = lastBackupTime 
    ? sessions?.filter(s => s.updated_at <= lastBackupTime).length || 0
    : 0;
  
  // Unsynced chats count
  const unsyncedChats = totalChats - syncedChats;
  
  // Alert conditions
  const showCloudDataAlert = cloudBackupInfo?.exists && !lastBackupTime && totalChats === 0;
  const showBackupReminder = true; // just for testing
  // const showBackupReminder = unsyncedChats >= 10;
  
  // Format history date
  const formatHistoryDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Get alert modal props based on type
  const getAlertProps = () => {
    switch (alert.type) {
      case 'success':
      case 'error':
      case 'warning':
        return {
          primaryText: 'Okay',
          onPrimary: hideAlert,
        };
      case 'confirm-logout':
        return {
          primaryText: 'Logout',
          onPrimary: confirmLogout,
          secondaryText: 'Cancel',
          onSecondary: hideAlert,
        };
      case 'confirm-restore':
        return {
          primaryText: 'Restore',
          onPrimary: confirmRestore,
          secondaryText: 'Cancel',
          onSecondary: hideAlert,
        };
      default:
        return {
          primaryText: 'Okay',
          onPrimary: hideAlert,
        };
    }
  };

  return (
    <>
      <SlideLeftModal visible={visible} onClose={onClose} title="Account">
        <View style={styles.container}>
          {isLoggedIn ? (
            // Logged in state
            <View style={styles.loggedInContainer}>
              {/* Unified Card - Profile, Stats & Sync */}
              <View style={styles.unifiedCard}>
                {/* Profile Section */}
                <View style={styles.profileRow}>
                  <Image
                    source={{ uri: currentUser?.avatarUrl }}
                    style={styles.profileImage}
                  />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{currentUser?.name}</Text>
                    <Text style={styles.profileEmail}>{currentUser?.email}</Text>
                  </View>
                  <Pressable 
                    style={styles.logoutBadge} 
                    onPress={handleLogout}
                    android_ripple={{ color: 'rgba(239,68,68,0.2)', borderless: true }}
                  >
                    <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>

                {/* Separator */}
                <View style={styles.cardSeparator} />

                {/* Stats Section */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{totalChats}/{syncedChats}</Text>
                    <Text style={styles.statLabel}>Synced chat</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>G-Drive</Text>
                    <Text style={styles.statLabel}>Storage</Text>
                  </View>
                </View>

                {/* Separator */}
                <View style={styles.cardSeparator} />

                {/* Sync Section */}
                <View style={styles.syncHeader}>
                  <Text style={styles.syncLabel}>Last backup:</Text>
                  <Text style={styles.syncTime}>
                    {lastBackupTime ? formatBackupTime(lastBackupTime) : 'Not synced'}
                  </Text>
                </View>
                
                <View style={styles.syncActions}>
                  <Pressable 
                    style={[styles.syncBtn, isBackingUp && styles.syncBtnDisabled]}
                    onPress={handleBackup}
                    disabled={isBackingUp}
                    android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                  >
                    {isBackingUp ? (
                      <ActivityIndicator size="small" color={COLORS.fg} />
                    ) : (
                      <Ionicons name="cloud-upload-outline" size={18} color={COLORS.fg} />
                    )}
                    <Text style={styles.syncBtnText}>
                      {isBackingUp ? 'Syncing...' : 'Backup'}
                    </Text>
                  </Pressable>
                  
                  <Pressable 
                    style={[styles.syncBtn, isBackingUp && styles.syncBtnDisabled]}
                    onPress={handleRestore}
                    disabled={isBackingUp}
                    android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                  >
                    <Ionicons name="cloud-download-outline" size={18} color={COLORS.fg} />
                    <Text style={styles.syncBtnText}>Restore</Text>
                  </Pressable>
                </View>
              </View>

              {/* Alert Cards */}
              {showCloudDataAlert && (
                <Pressable 
                  style={styles.alertCard}
                  onPress={handleRestore}
                  android_ripple={{ color: 'rgba(99,102,241,0.2)' }}
                >
                  <View style={styles.alertIconContainer}>
                    <Ionicons name="cloud-done" size={24} color="#6366f1" />
                  </View>
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle}>Cloud backup found!</Text>
                    <Text style={styles.alertMessage}>
                      You have {cloudBackupInfo.sessionCount} chats saved. Tap to restore.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.fgMuted} />
                </Pressable>
              )}

              {showBackupReminder && (
                <Pressable 
                  style={[styles.alertCard, styles.alertWarning]}
                  onPress={handleBackup}
                  android_ripple={{ color: 'rgba(245,158,11,0.2)' }}
                >
                  <View style={[styles.alertIconContainer, styles.alertIconWarning]}>
                    <Ionicons name="warning" size={24} color="#f59e0b" />
                  </View>
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle}>{unsyncedChats} chats not backed up</Text>
                    <Text style={styles.alertMessage}>
                      Tap to backup now and keep your data safe.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.fgMuted} />
                </Pressable>
              )}

              {/* Backup History */}
              {backupHistory.length > 0 && (
                <View style={styles.historySection}>
                  <Text style={styles.historySectionTitle}>Sync History</Text>
                  {backupHistory.slice(0, 5).map((item, index) => (
                    <View key={item.id || index} style={styles.historyItem}>
                      <View style={[
                        styles.historyIcon, 
                        item.type === 'backup' ? styles.historyIconBackup : styles.historyIconRestore,
                        !item.success && styles.historyIconFailed
                      ]}>
                        <Ionicons 
                          name={item.type === 'backup' ? 'cloud-upload' : 'cloud-download'} 
                          size={14} 
                          color={item.success ? (item.type === 'backup' ? '#10b981' : '#6366f1') : '#ef4444'} 
                        />
                      </View>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyTitle}>
                          {item.type === 'backup' ? 'Backup' : 'Restore'}{item.success ? '' : ' failed'}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {formatHistoryDate(item.timestamp)} • {item.session_count} chats
                        </Text>
                      </View>
                      {item.success ? (
                        <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                      ) : (
                        <Ionicons name="close-circle" size={18} color="#ef4444" />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
        ) : (
          // Not logged in state
          <View style={styles.notLoggedInContainer}>
            <View style={styles.loginHeader}>
              <LinearGradient
                colors={['transparent', COLORS.bg, COLORS.bg]}
                locations={[0, 0.8, 1]}
                style={[styles.floatingHeader, { height: 75 }]}
                pointerEvents="none"
              />
              <Image source={GoogleLogo} style={{ width: '100%', height: 250, borderRadius: 16 }} />
              <Text style={styles.loginTitle}>Cloud Database Sync</Text>
              <Text style={styles.loginSubtitle}>
                Sign in to backup your data and sync across devices
              </Text>
            </View>

            <View style={styles.loginButtons}>
              <Pressable 
                style={[styles.loginBtn, styles.googleBtn]}
                onPress={handleGoogleLogin}
                disabled={isLoggingIn}
                android_ripple={{ color: 'rgba(0,0,0,0.2)' }}
              >
                {isLoggingIn ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  
                  <SvgXml xml={GOOGLE_FAVICON} width={23} height={23} />
                )}
                <Text style={styles.loginBtnText}>Continue with Google</Text>
              </Pressable>
            </View>

            <Text style={styles.privacyNote}>
              Your data is stored securely in your Google Drive.
            </Text>
          </View>
        )}
      </View>
    </SlideLeftModal>
    
    {/* Custom Alert Modal */}
    <AlertModal
      visible={alert.visible}
      title={alert.title}
      message={alert.message}
      {...getAlertProps()}
    />
  </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  // Logged in styles
  loggedInContainer: {
    flex: 1,
  },
  cardGroup: {
    gap: 3,
  },
  card: {
    backgroundColor: COLORS.bgSecondary,
    padding: 14,
  },
  cardTop: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  cardMiddle: {
    borderRadius: 5,
  },
  cardBottom: {
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  cardSingle: {
    borderRadius: 20,
  },
  unifiedCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    padding: 14,
  },
  cardSeparator: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontFamily: FONTS.display,
    color: COLORS.fg,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.fgMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.borderLight,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.inputBg,
  },
  profileInfo: {
    flex: 1,
    marginHorizontal: 16,
  },
  profileName: {
    fontSize: 18,
    fontFamily: FONTS.sans,
    color: COLORS.fg,
  },
  profileEmail: {
    fontSize: 13,
    color: COLORS.fgMuted,
    marginTop: 2,
  },
  logoutBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  syncLabel: {
    fontSize: 13,
    color: COLORS.fgMuted,
  },
  syncTime: {
    fontSize: 12,
    color: COLORS.fgMuted,
  },
  syncActions: {
    flexDirection: 'row',
    gap: 8,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    fontSize: 13,
    color: COLORS.fg,
  },
  // Not logged in styles
  notLoggedInContainer: {
    flex: 1,
    justifyContent: 'start',
  },
  images: {
    height: '20%',
    backgroundColor: COLORS.fg,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  floatingHeader: {
    position: 'absolute',
    bottom: 65,
    left: 0,
    right: 0,
    zIndex: 5,
  },  
  loginTitle: {
    fontSize: 24,
    fontFamily: FONTS.display,
    color: COLORS.fg,
    marginTop: 5,
  },
  loginSubtitle: {
    fontSize: 15,
    color: COLORS.fgMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  loginButtons: {
    gap: 12,
    paddingHorizontal: 16,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  googleBtn: {
    backgroundColor: COLORS.fg,
  },
  loginBtnText: {
    fontSize: 16,
    color: COLORS.bg,
    fontFamily: FONTS.displayItalic,
  },
  privacyNote: {
    fontSize: 12,
    color: COLORS.fgMuted,
    textAlign: 'center',
    marginTop: 14,
  },
  // Alert Cards
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  alertWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  alertIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertIconWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontFamily: FONTS.display,
    color: COLORS.fg,
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: 12,
    color: COLORS.fgMuted,
    lineHeight: 16,
  },
  // History Section
  historySection: {
    marginTop: 24,
  },
  historySectionTitle: {
    fontSize: 13,
    fontFamily: FONTS.ai,
    color: COLORS.fgMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  historyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyIconBackup: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  historyIconRestore: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  historyIconFailed: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    color: COLORS.fg,
  },
  historyMeta: {
    fontSize: 12,
    color: COLORS.fgMuted,
    marginTop: 2,
  },
});
