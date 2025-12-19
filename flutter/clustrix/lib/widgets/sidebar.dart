import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../providers/app_provider.dart';
import '../models/session.dart';

/// EXACT MATCH RN SessionList + sidebarProfileBtn from App.js
/// 
/// Props from RN SessionList:
/// - sessions, currentSession
/// - onSelect, onDelete, onNew, onToggleFavorite, onRename
/// - onSearchQueryChange: (hasQuery) => void - triggers sidebar expand
/// - onContextMenuChange: (isOpen) => void
/// - isExpanded: bool - whether sidebar is expanded (search active)
/// - onCollapse: () => void
/// 
/// Styles from RN:
/// - SIDEBAR_PADDING = 12
/// - marginTop: 11 on container
/// - headerRow: paddingHorizontal 12, paddingRight 7, gap 10
/// - searchContainer: height 45, paddingHorizontal 14, bg inputBg, borderRadius 50, border 1 borderLight
/// - newChatBtn: width 45, height 45
/// - sessionList: paddingTop 20, paddingBottom 20
/// - sessionItem: paddingVertical 11, paddingHorizontal 17, marginBottom 2
/// - sectionHeader: paddingHorizontal 17, paddingVertical 8
/// - sidebarProfileBtn: padding 17, paddingTop 12, paddingBottom 32
class Sidebar extends StatefulWidget {
  final VoidCallback? onClose;
  final ValueChanged<bool>? onSearchQueryChange;
  final bool isExpanded;
  
  const Sidebar({
    super.key, 
    this.onClose,
    this.onSearchQueryChange,
    this.isExpanded = false,
  });

  @override
  State<Sidebar> createState() => _SidebarState();
}

const double _sidebarPadding = 12.0;

class _SidebarState extends State<Sidebar> {
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _onCollapse() {
    _searchFocusNode.unfocus();
    widget.onSearchQueryChange?.call(false);
  }

  @override
  Widget build(BuildContext context) {
    final appProvider = context.watch<AppProvider>();
    final sessions = appProvider.sessions;

    final filteredSessions = _searchQuery.isNotEmpty
        ? sessions.where((s) => s.name.toLowerCase().contains(_searchQuery.toLowerCase())).toList()
        : sessions;

    final favoriteSessions = filteredSessions.where((s) => s.isFavorite).toList();
    final regularSessions = filteredSessions.where((s) => !s.isFavorite).toList();

    // RN: container marginTop: 11
    return Container(
      color: AppColors.bg,
      child: Column(
        children: [
          // Floating header gradient for sidebar
          Stack(
            children: [
              // RN: floatingHeaderSidebar height 70
              Container(
                height: 70,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [AppColors.bg, AppColors.bg, Colors.transparent],
                    stops: [0, 0.7, 1],
                  ),
                ),
              ),
              // Header row at marginTop: 11
              Positioned(
                top: 11,
                left: 0,
                right: 0,
                child: _buildHeaderRow(context),
              ),
            ],
          ),
          Expanded(
            child: _buildSessionList(context, favoriteSessions, regularSessions, appProvider),
          ),
          _buildProfileSection(context),
        ],
      ),
    );
  }

  Widget _buildHeaderRow(BuildContext context) {
    // RN: headerRow flexDirection row, paddingHorizontal 12, paddingRight 7, gap 10
    return Padding(
      padding: const EdgeInsets.fromLTRB(_sidebarPadding, 0, _sidebarPadding - 5, 0),
      child: Row(
        children: [
          // RN: searchContainer flex 1, height 45, paddingHorizontal 14
          Expanded(
            child: GestureDetector(
              onTap: () {
                if (!widget.isExpanded) {
                  widget.onSearchQueryChange?.call(true);
                  _searchFocusNode.requestFocus();
                }
              },
              child: Container(
                height: 45,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: AppColors.inputBg,
                  borderRadius: BorderRadius.circular(50),
                  border: Border.all(color: AppColors.borderLight),
                ),
                child: Row(
                  children: [
                    // RN: isExpanded ? ArrowLeft : Search icon
                    if (widget.isExpanded)
                      GestureDetector(
                        onTap: _onCollapse,
                        child: const Icon(LucideIcons.arrowLeft, size: 23, color: AppColors.icon),
                      )
                    else
                      const Icon(LucideIcons.search, size: 23, color: AppColors.icon),
                    // RN: gap 10
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        focusNode: _searchFocusNode,
                        onChanged: (value) {
                          setState(() => _searchQuery = value);
                        },
                        onTap: () {
                          widget.onSearchQueryChange?.call(true);
                        },
                        style: const TextStyle(
                          fontFamily: AppFonts.sans,
                          fontSize: 16,
                          color: AppColors.fg,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'Search...',
                          hintStyle: TextStyle(color: AppColors.fgMuted),
                          border: InputBorder.none,
                          isCollapsed: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                    ),
                    // RN: searchQuery ? close icon : null
                    if (_searchQuery.isNotEmpty)
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _searchQuery = '';
                            _searchController.clear();
                          });
                        },
                        child: const Icon(Icons.close, size: 23, color: AppColors.icon),
                      ),
                  ],
                ),
              ),
            ),
          ),
          // RN: gap 10
          const SizedBox(width: 10),
          // RN: newChatBtn width 45, height 45, borderRadius 40
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                context.read<AppProvider>().clearCurrentSession();
                widget.onClose?.call();
              },
              borderRadius: BorderRadius.circular(40),
              child: Container(
                width: 45,
                height: 45,
                alignment: Alignment.center,
                child: const Icon(Icons.edit_outlined, size: 23, color: AppColors.icon),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSessionList(
    BuildContext context,
    List<Session> favorites,
    List<Session> regular,
    AppProvider appProvider,
  ) {
    if (favorites.isEmpty && regular.isEmpty) {
      // RN: emptyContainer alignItems center, paddingTop 40, paddingHorizontal 12
      return Center(
        child: Padding(
          padding: const EdgeInsets.only(top: 40, left: _sidebarPadding, right: _sidebarPadding),
          child: Text(
            _searchQuery.isNotEmpty ? 'No chats found' : 'No conversations yet',
            style: const TextStyle(
              fontFamily: AppFonts.sans,
              fontSize: 14,
              color: AppColors.fgMuted,
            ),
          ),
        ),
      );
    }

    // RN: sessionList paddingTop 20, paddingBottom 20
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 20),
      children: [
        if (favorites.isNotEmpty) ...[
          _buildSectionHeader('Favorites'),
          ...favorites.map((session) => _SessionItem(
            session: session,
            isActive: appProvider.currentSession?.id == session.id,
            onSelect: () {
              appProvider.selectSession(session);
              widget.onClose?.call();
            },
            onLongPress: () => _showContextMenu(context, session),
          )),
        ],
        if (regular.isNotEmpty) ...[
          if (favorites.isNotEmpty) _buildSectionHeader('Recent'),
          ...regular.map((session) => _SessionItem(
            session: session,
            isActive: appProvider.currentSession?.id == session.id,
            onSelect: () {
              appProvider.selectSession(session);
              widget.onClose?.call();
            },
            onLongPress: () => _showContextMenu(context, session),
          )),
        ],
      ],
    );
  }

  Widget _buildSectionHeader(String title) {
    // RN: sectionHeader paddingHorizontal 17, paddingVertical 8
    return Padding(
      padding: const EdgeInsets.fromLTRB(_sidebarPadding + 5, 8, _sidebarPadding + 5, 8),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontFamily: AppFonts.display,
          fontSize: 12,
          color: AppColors.fgMuted,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildProfileSection(BuildContext context) {
    // RN: sidebarProfileBtn padding 17, paddingTop 12, paddingBottom 32
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          // TODO: Open personalization
        },
        child: Container(
          padding: const EdgeInsets.fromLTRB(17, 12, 17, 32),
          child: Row(
            children: [
              // RN: sidebarProfilePlaceholder width 40, height 40, borderRadius 20
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.inputBg,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.account_circle_outlined, color: AppColors.icon, size: 38),
              ),
              // RN: sidebarProfileInfo marginLeft 12
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // RN: sidebarProfileName fontSize 15
                    Text(
                      'Not Logged in',
                      style: TextStyle(
                        fontFamily: AppFonts.sans,
                        fontSize: 15,
                        color: AppColors.fg,
                      ),
                    ),
                    SizedBox(height: 2),
                    // RN: sidebarBackupTime fontSize 12
                    Text(
                      'Open settings',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.fgMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showContextMenu(BuildContext context, Session session) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.pencil, color: AppColors.fg, size: 18),
              title: const Text('Rename', style: TextStyle(color: AppColors.fg)),
              onTap: () {
                Navigator.pop(ctx);
                _showRenameDialog(context, session);
              },
            ),
            ListTile(
              leading: Icon(
                LucideIcons.star,
                color: session.isFavorite ? AppColors.warning : AppColors.fg,
                size: 18,
              ),
              title: Text(
                session.isFavorite ? 'Unfavorite' : 'Favorite',
                style: const TextStyle(color: AppColors.fg),
              ),
              onTap: () {
                Navigator.pop(ctx);
                context.read<AppProvider>().toggleFavorite(session.id);
              },
            ),
            ListTile(
              leading: const Icon(LucideIcons.trash2, color: AppColors.danger, size: 18),
              title: const Text('Delete', style: TextStyle(color: AppColors.danger)),
              onTap: () {
                Navigator.pop(ctx);
                _showDeleteConfirm(context, session);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showRenameDialog(BuildContext context, Session session) {
    final controller = TextEditingController(text: session.name);
    
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Rename Chat', style: TextStyle(color: AppColors.fg)),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(color: AppColors.fg),
          decoration: const InputDecoration(
            hintText: 'Chat name',
            hintStyle: TextStyle(color: AppColors.fgMuted),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              context.read<AppProvider>().renameSession(session.id, controller.text);
              Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirm(BuildContext context, Session session) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Delete Chat', style: TextStyle(color: AppColors.fg)),
        content: Text(
          'Are you sure you want to delete "${session.name}"?',
          style: const TextStyle(color: AppColors.fgMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              context.read<AppProvider>().deleteSession(session.id);
              Navigator.pop(ctx);
            },
            child: const Text('Delete', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
  }
}

class _SessionItem extends StatelessWidget {
  final Session session;
  final bool isActive;
  final VoidCallback onSelect;
  final VoidCallback onLongPress;

  const _SessionItem({
    required this.session,
    required this.isActive,
    required this.onSelect,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    // RN: sessionItem paddingVertical 11, paddingHorizontal 17, marginBottom 2
    // RN: sessionItemActive bg hover
    return Material(
      color: isActive ? AppColors.hover : Colors.transparent,
      child: InkWell(
        onTap: onSelect,
        onLongPress: onLongPress,
        child: Container(
          padding: const EdgeInsets.fromLTRB(_sidebarPadding + 5, 11, _sidebarPadding + 5, 11),
          margin: const EdgeInsets.only(bottom: 2),
          child: Text(
            session.name.isNotEmpty ? session.name : 'Untitled',
            // RN: sessionTitle fontSize 15, color fgMuted (or fg if active)
            style: TextStyle(
              fontFamily: AppFonts.sans,
              fontSize: 15,
              color: isActive ? AppColors.fg : AppColors.fgMuted,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}
