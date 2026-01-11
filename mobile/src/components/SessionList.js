import React, { useState, useRef, memo, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Animated, Dimensions, FlatList } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { Pressable } from 'react-native-gesture-handler';
import { SvgXml } from 'react-native-svg';
import ContextMenu from './ContextMenu';
import ConfirmModal from './ConfirmModal';
import InputModal from './InputModal';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { LucideSearch, LucideArrowLeft, Pencil, Trash2, Star, LucideX } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PENCIL } from '../constants/strings';
import LongPressGuard from './LongPressGuard';
import AlertModal from './AlertModal';

const SessionItem = memo(function SessionItem({ session, isActive, onSelect, onLongPress, onToggleFavorite }) {
  return (
    <LongPressGuard
      onLongPress={(event) => onLongPress?.(session, event.nativeEvent)}
      disabled={!onLongPress}
    >
      <Pressable
        style={[styles.sessionItem, isActive && styles.sessionItemActive]}
        onPress={() => onSelect(session)}
        android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
      >
        <Text 
          style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} 
          numberOfLines={1}
        >
          {session.name || 'Untitled'}
        </Text>
      </Pressable>
    </LongPressGuard>
  );
});

const SessionList = memo(function SessionList({ sessions, currentSession, onSelect, onDelete, onRename, onToggleFavorite, onNew, onSearchQueryChange, onContextMenuChange, isExpanded, onCollapse, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, session: null, position: { x: 0, y: 0 } });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, session: null });
  const [renameModal, setRenameModal] = useState({ visible: false, session: null, name: '' });
  const [displayCount, setDisplayCount] = useState(20); // Lazy load: start with 20 items
  const searchInputRef = useRef(null);

  // Combine filtering and sorting into a single memoized computation
  const displayedSessions = useMemo(() => {
    // Filter by search query
    const filtered = searchQuery
      ? sessions.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      : sessions;
    
    // Separate favorites and regular sessions
    const favorites = filtered.filter(s => s.is_favorite);
    const regular = filtered.filter(s => !s.is_favorite);
    
    // Combine and slice for lazy loading
    const combined = [...favorites, ...regular];
    return combined.slice(0, displayCount);
  }, [sessions, searchQuery, displayCount]);
  
  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (displayCount < sessions.length) {
      setDisplayCount(prev => Math.min(prev + 20, sessions.length));
    }
  }, [displayCount, sessions.length]);

  // Handle session select - if already active, just close sidebar
  const handleSelectSession = useCallback((session) => {
    if (currentSession?.id === session.id) {
      // Already active - just close sidebar, don't reload
      onClose?.();
    } else {
      // New session - select and close
      onSelect(session);
      onClose?.();
    }
  }, [currentSession?.id, onSelect, onClose]);

  const handleLongPress = (session, event) => {
    setContextMenu({
      visible: true,
      session,
      position: { x: event.pageX, y: event.pageY - 0 },
    });
    onContextMenuChange?.(true);
  };

  // Context menu options with Lucide icons
  const getContextOptions = () => {
    if (!contextMenu.session) return [];
    return [
      { label: 'Rename', icon: Pencil, onPress: () => setRenameModal({ visible: true, session: contextMenu.session, name: contextMenu.session.name || '' }) },
      { 
        label: contextMenu.session.is_favorite ? 'Unfavorite' : 'Favorite', 
        icon: Star, 
        onPress: () => onToggleFavorite?.(contextMenu.session.id) 
      },
      { label: 'Delete', icon: Trash2, danger: true, onPress: () => setConfirmDelete({ visible: true, session: contextMenu.session }) },
    ];
  };

  return (
    <Animated.View style={[styles.container, { marginTop: 11 }]}>
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        options={getContextOptions()}
        onClose={() => { setContextMenu({ ...contextMenu, visible: false }); onContextMenuChange?.(false); }}
      />
      {/* <ConfirmModal
        visible={confirmDelete.visible}
        title="Delete Chat"
        message={`Are you sure you want to delete "${confirmDelete.session?.name}"?`}
        confirmText="Delete"
        danger
        onConfirm={() => {
          onDelete(confirmDelete.session.id);
          setConfirmDelete({ visible: false, session: null });
        }}
        onCancel={() => setConfirmDelete({ visible: false, session: null })}
      /> */}
       <AlertModal
          visible={confirmDelete.visible}
          title="Confirm Delete"
          message={`Are you sure you want to delete "${confirmDelete.session?.name}"?`}
          primaryText="Delete"
          secondaryText="Cancel"
          danger
          onPrimary={() => {
            if (confirmDelete.session) onDelete(confirmDelete.session.id);
            setConfirmDelete({ visible: false, session: null });
          }}
          onSecondary={() => setConfirmDelete({ visible: false, session: null })}
        />

      <LinearGradient
        colors={[COLORS.bgv2, COLORS.bgv2, 'transparent']}
        locations={[0, 0.7, 1]}
        style={[styles.floatingHeaderSidebar, { height: 70 }]}
        pointerEvents="none"
      />

      <View style={styles.headerRow}>
        <Pressable 
          style={styles.searchContainer} 
          onPressIn={() => {
            // Expand immediately (avoid press delay), focus follows on press.
            if (!isExpanded) {
              onSearchQueryChange?.(true);
            }
          }}
          onPress={() => {
            // Only focus when collapsed
            if (!isExpanded) {
              searchInputRef.current?.focus();
            }
          }}
          delayPressIn={0}
        >
          {isExpanded ? (
            <Pressable 
              onPress={() => {
                // Collapse: blur input, dismiss keyboard, then collapse
                searchInputRef.current?.blur();
                onCollapse?.();
              }} 
              style={[styles.xButton, { borderRadius: 40, overflow: 'hidden' }]} 
              
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
              delayPressIn={0}
            >
              <LucideArrowLeft size={23} color={COLORS.icon} />
            </Pressable>
          ) : (
            <LucideSearch size={23} color={COLORS.icon} style={{marginHorizontal: 11}} />
          )}
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={COLORS.icon}
            value={searchQuery}
            onFocus={() => onSearchQueryChange?.(true)}
            onChangeText={(text) => {
              setSearchQuery(text);
            }}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => {
                setSearchQuery('');
              }}
              style={[styles.xButton, { borderRadius: 40, overflow: 'hidden' }]} 
              
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
            >
              <LucideX size={23} color={COLORS.icon} />
            </Pressable>
          ) : null}
        </Pressable>
        {/* New Chat Button */}
        <Pressable 
          // 1. Pindahkan borderRadius ke sini (style utama)
          // Pastikan styles.newChatBtn juga punya width & height yang sama biar jadi lingkaran sempurna
          onPress={onNew} 
          style={[styles.newChatBtn, { borderRadius: 40, overflow: 'hidden' }]} 
          android_ripple={{ 
            color: 'rgba(255,255,255,0.2)', 
            // 2. Kalau mau ripplenya kepotong pas di lingkaran, set borderless: false
            borderless: false 
          }}
        >
          {/* View di dalem sini sebenernya jadi redundan kalau stylingnya udah di Pressable */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <SvgXml xml={PENCIL} width={23} height={23} style={[styles.newChatIcon, {color: COLORS.icon}]} />
          </View>
        </Pressable>
      </View>

      {/* Sessions */}
      <FlatList
        data={displayedSessions}
        // Keep extraData stable to avoid full list re-render on sidebar expand/collapse.
        extraData={currentSession?.id}
        keyExtractor={(item) => item.id}
        style={displayedSessions.length > 0 ? { width: SCREEN_WIDTH } : undefined}
        renderItem={({ item, index }) => {
          // Get prev item to determine if we need section header
          const prevItem = index > 0 ? displayedSessions[index - 1] : null;
          
          // Show "Favorites" header before first favorite item
          const showFavoritesHeader = item.is_favorite && (index === 0 || !prevItem?.is_favorite);
          
          // Show "Recent" header before first non-favorite item that comes after favorites
          const showRecentHeader = !item.is_favorite && prevItem?.is_favorite === true;
          
          return (
            <React.Fragment key={`${item.id}-${item.is_favorite}`}>
              {showFavoritesHeader && (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Favorites</Text>
                </View>
              )}
              {showRecentHeader && (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent</Text>
                </View>
              )}
              <SessionItem
                session={item}
                isActive={currentSession?.id === item.id}
                onSelect={handleSelectSession}
                onLongPress={handleLongPress}
                onToggleFavorite={onToggleFavorite}
              />
            </React.Fragment>
          );
        }}
        contentContainerStyle={styles.sessionList}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No chats found' : 'No conversations yet'}
            </Text>
          </View>
        }
      />
      
      <InputModal
        visible={renameModal.visible}
        title="Rename Chat"
        fields={[{ key: 'name', placeholder: 'Chat name', value: renameModal.session?.name || '', required: true }]}
        submitText="Save"
        onSubmit={(values) => {
          onRename?.(renameModal.session.id, values.name);
          setRenameModal({ visible: false, session: null, name: '' });
        }}
        onCancel={() => setRenameModal({ visible: false, session: null, name: '' })}
      />
      {/* Gradient mask for edge */}
      <LinearGradient
        colors={['transparent', COLORS.bgv2]}
        start={{ x: 0, y:0 }}
        end={{ x: 0.7, y: 0 }}
        style={[styles.edgeGradient, { width: 50 }]}
        pointerEvents="none"
      />
    </Animated.View>
  );
});

export default SessionList;

const SIDEBAR_PADDING = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgv2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIDEBAR_PADDING,
    paddingRight: SIDEBAR_PADDING - 5,
    gap: 10,
    zIndex: 3,
  },
  newChatBtn: {
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  xButton: {
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatIcon: {
    flexShrink: 0,
    color: COLORS.fg,
    width: 35,
    height: 35,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 45,
    backgroundColor: COLORS.borderLight,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.inputBg,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 16,
    padding: 0,
    fontFamily: FONTS.sans,
  },
  floatingHeaderSidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  sessionList: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  sessionItem: {
    width: SCREEN_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: SIDEBAR_PADDING+5,
    marginBottom: 2,
  },
  sessionItemActive: {
    backgroundColor: COLORS.bgSecondary, // Lighter than bgv2 for visibility
  },
  sessionTitle: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 14.7,
    fontFamily: FONTS.sans,
  },
  sessionTitleActive: {
    color: COLORS.fg,
  },
  favoriteBtn: {
    padding: 4,
  },
  sectionHeader: {
    paddingHorizontal: SIDEBAR_PADDING + 5,
    paddingVertical: 8,
  },
  edgeGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: -3,
    zIndex: 1,
  },
  sectionTitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.display,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SIDEBAR_PADDING + 5,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: SIDEBAR_PADDING,
    gap: 12,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
});
