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
              {/* Profile Section */}
              <View style={styles.profileSection}>
              <Image
                source={{ uri: currentUser?.avatarUrl }}
                style={styles.profileImage}
              />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{currentUser?.name}</Text>
                <Text style={styles.profileEmail}>{currentUser?.email}</Text>
                              <View style={styles.providerBadge}>
                  <Ionicons 
                    name="logo-google" 
                    size={12} 
                    color={COLORS.fgMuted} 
                  />
                  <Text style={styles.providerText}>Google</Text>
                </View>
              </View>
            </View>

            {/* Backup Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cloud Backup</Text>
              <View style={styles.backupInfo}>
                <Text style={styles.backupLabel}>Last backup:</Text>
                <Text style={styles.backupTime}>{formatBackupTime(lastBackupTime)}</Text>
              </View>
              
              <View style={styles.backupButtons}>
                <Pressable 
                  style={[styles.backupBtn, isBackingUp && styles.backupBtnDisabled]}
                  onPress={handleBackup}
                  disabled={isBackingUp}
                  android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
                >
                  {isBackingUp ? (
                    <ActivityIndicator size="small" color={COLORS.fg} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={18} color={COLORS.fg} />
                  )}
                  <Text style={styles.backupBtnText}>
                    {isBackingUp ? 'Backing up...' : 'Backup Now'}
                  </Text>
                </Pressable>
                
                <Pressable 
                  style={[styles.backupBtn, styles.restoreBtn]}
                  onPress={handleRestore}
                  disabled={isBackingUp}
                  android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
                >
                  <Ionicons name="cloud-download-outline" size={18} color={COLORS.fg} />
                  <Text style={styles.backupBtnText}>Restore</Text>
                </Pressable>
              </View>
            </View>

            {/* Logout Button */}
            <Pressable style={styles.logoutBtn} onPress={handleLogout} android_ripple={{ color: 'rgba(255,100,100,0.2)' }}>
              <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
              <Text style={styles.logoutBtnText}>Logout</Text>
            </Pressable>
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
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  profileImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.inputBg,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontFamily: FONTS.display,
    color: COLORS.fg,
  },
  profileEmail: {
    fontSize: 13,
    color: COLORS.fgMuted,
    marginTop: 2,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  providerText: {
    fontSize: 11,
    color: COLORS.fgMuted,
    marginLeft: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONTS.display,
    color: COLORS.fgMuted,
    marginBottom: 12,
  },
  backupInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backupLabel: {
    fontSize: 14,
    color: COLORS.fgMuted,
  },
  backupTime: {
    fontSize: 14,
    color: COLORS.fg,
  },
  backupButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.inputBg,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  backupBtnDisabled: {
    opacity: 0.6,
  },
  restoreBtn: {
    backgroundColor: 'transparent',
  },
  backupBtnText: {
    fontSize: 14,
    color: COLORS.fg,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 'auto',
    marginBottom: 40,
  },
  logoutBtnText: {
    fontSize: 14,
    color: COLORS.danger,
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
    lineHeight: 18,
  },
});
