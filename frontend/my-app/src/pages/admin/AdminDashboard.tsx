import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listReports, resolveReport, listUsersAdmin, banUser, unbanUser,
  restrictUser, unrestrictUser, adminDeleteUser, promoteToAdmin, demoteAdmin,
} from '../../api/admin'
import type { ReportRow, AdminUserRow } from '../../api/admin'
import { useLanguage } from '../../context/LanguageContext'
import Logo from '../../components/Logo'

type Tab = 'reports' | 'users'
type ReportStatus = 'pending' | 'removed' | 'dismissed'

// ========== 通用确认/输入弹窗，替代浏览器原生 confirm/prompt ==========

type DialogState =
  | { kind: 'confirm'; title: string; message: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'prompt'; title: string; message: string; danger?: boolean; onConfirm: (value: string) => void }
  | null

function Dialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  useEffect(() => { setValue('') }, [state])
  if (!state) return null

  const submit = () => {
    if (state.kind === 'prompt') {
      if (!value.trim()) return
      state.onConfirm(value.trim())
    } else {
      state.onConfirm()
    }
    onClose()
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        <h3 style={s.dialogTitle}>{state.title}</h3>
        <p style={s.dialogMessage}>{state.message}</p>
        {state.kind === 'prompt' && (
          <textarea
            autoFocus
            style={s.dialogInput}
            placeholder={t('admin.reasonPlaceholder')}
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        )}
        <div style={s.dialogActions}>
          <button style={s.dialogCancel} onClick={onClose}>{t('common.cancel')}</button>
          <button
            style={state.danger ? s.dialogConfirmDanger : s.dialogConfirm}
            disabled={state.kind === 'prompt' && !value.trim()}
            onClick={submit}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return <span style={s.avatar}>{name.slice(0, 1).toUpperCase()}</span>
}

function Spinner() {
  return (
    <div style={s.spinnerWrap}>
      <div style={s.spinner} />
    </div>
  )
}

function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
  const isSuperAdmin = currentUser.role === 'super_admin'

  const [tab, setTab] = useState<Tab>('reports')
  const [dialog, setDialog] = useState<DialogState>(null)

  const [pendingCount, setPendingCount] = useState(0)
  const [totalUsers, setTotalUsers] = useState(0)
  const loadStats = () => {
    listReports('pending', 0, 1).then(d => setPendingCount(d.total)).catch(() => {})
    listUsersAdmin('', '', 0, 1).then(d => setTotalUsers(d.total)).catch(() => {})
  }
  useEffect(loadStats, [])

  const [reportStatus, setReportStatus] = useState<ReportStatus>('pending')
  const [reports, setReports] = useState<ReportRow[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)

  const loadReports = () => {
    setReportsLoading(true)
    listReports(reportStatus)
      .then(d => setReports(d.reports))
      .catch(() => {})
      .finally(() => setReportsLoading(false))
  }
  useEffect(() => { if (tab === 'reports') loadReports() }, [tab, reportStatus])

  const doResolve = async (reportId: string, action: 'remove' | 'dismiss') => {
    try {
      await resolveReport(reportId, action)
      loadReports()
      loadStats()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('admin.actionFailed'))
    }
  }

  const handleResolve = (reportId: string, action: 'remove' | 'dismiss') => {
    if (action === 'dismiss') { doResolve(reportId, action); return }
    setDialog({
      kind: 'confirm',
      title: t('admin.dialog.removeTitle'),
      message: t('admin.dialog.removeMsg'),
      danger: true,
      onConfirm: () => doResolve(reportId, action),
    })
  }

  const [userQuery, setUserQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const loadUsers = () => {
    setUsersLoading(true)
    listUsersAdmin(userQuery, roleFilter)
      .then(d => setUsers(d.users))
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }
  useEffect(() => { if (tab === 'users') loadUsers() }, [tab])

  const handleUserSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadUsers()
  }

  const runUserAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      loadUsers()
      loadStats()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('admin.actionFailed'))
    }
  }

  const handleBan = (u: AdminUserRow) => setDialog({
    kind: 'prompt',
    title: t('admin.dialog.banTitle', { name: u.username }),
    message: t('admin.dialog.banMsg'),
    danger: true,
    onConfirm: reason => runUserAction(() => banUser(u.user_id, reason)),
  })
  const handleUnban = (u: AdminUserRow) => setDialog({
    kind: 'confirm',
    title: t('admin.dialog.unbanTitle'),
    message: t('admin.dialog.unbanMsg', { name: u.username }),
    onConfirm: () => runUserAction(() => unbanUser(u.user_id)),
  })
  const handleRestrict = (u: AdminUserRow) => setDialog({
    kind: 'prompt',
    title: t('admin.dialog.restrictTitle', { name: u.username }),
    message: t('admin.dialog.restrictMsg'),
    onConfirm: reason => runUserAction(() => restrictUser(u.user_id, reason)),
  })
  const handleUnrestrict = (u: AdminUserRow) => setDialog({
    kind: 'confirm',
    title: t('admin.dialog.unrestrictTitle'),
    message: t('admin.dialog.unrestrictMsg', { name: u.username }),
    onConfirm: () => runUserAction(() => unrestrictUser(u.user_id)),
  })
  const handleDeleteUser = (u: AdminUserRow) => setDialog({
    kind: 'confirm',
    title: t('admin.dialog.deleteTitle'),
    message: t('admin.dialog.deleteMsg', { name: u.username }),
    danger: true,
    onConfirm: () => runUserAction(() => adminDeleteUser(u.user_id)),
  })
  const handlePromote = (u: AdminUserRow) => setDialog({
    kind: 'confirm',
    title: t('admin.dialog.promoteTitle'),
    message: t('admin.dialog.promoteMsg', { name: u.username }),
    onConfirm: () => runUserAction(() => promoteToAdmin(u.user_id)),
  })
  const handleDemote = (u: AdminUserRow) => setDialog({
    kind: 'confirm',
    title: t('admin.dialog.demoteTitle'),
    message: t('admin.dialog.demoteMsg', { name: u.username }),
    onConfirm: () => runUserAction(() => demoteAdmin(u.user_id)),
  })

  const roleLabel = (role: string) =>
    role === 'super_admin' ? t('role.superAdmin') : role === 'admin' ? t('role.admin') : t('role.user')
  const roleBadgeStyle = (role: string) =>
    role === 'super_admin' ? s.badgePurple : role === 'admin' ? s.badgeBlue : s.badgeGray

  const reportTabs: { key: ReportStatus; label: string; icon: string }[] = [
    { key: 'pending', label: t('admin.reports.pending'), icon: '🚩' },
    { key: 'removed', label: t('admin.reports.removed'), icon: '🗑️' },
    { key: 'dismissed', label: t('admin.reports.dismissed'), icon: '✅' },
  ]

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>{t('nav.back')}</button>
        <span style={s.logo}><Logo /></span>
        <span style={s.headerTitle}>{t('admin.title')}</span>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div style={s.card}>
            <div style={s.userAvatar}>{currentUser.username?.slice(0, 1).toUpperCase()}</div>
            <div style={s.userCardName}>{currentUser.username}</div>
            <div style={s.userCardEmail}>{currentUser.email}</div>
            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
              <span style={roleBadgeStyle(currentUser.role)}>{roleLabel(currentUser.role)}</span>
            </div>
            <div style={s.userStats}>
              <div style={s.statItem}>
                <span style={s.statNum}>{pendingCount}</span>
                <span style={s.statLabel}>{t('admin.stat.pending')}</span>
              </div>
              <div style={s.statItem}>
                <span style={s.statNum}>{totalUsers}</span>
                <span style={s.statLabel}>{t('admin.stat.totalUsers')}</span>
              </div>
            </div>
          </div>

          <div style={s.navCard}>
            <button
              style={tab === 'reports' ? s.navItemActive : s.navItem}
              onClick={() => setTab('reports')}
            >
              {t('admin.nav.reports')}
            </button>
            <button
              style={tab === 'users' ? s.navItemActive : s.navItem}
              onClick={() => setTab('users')}
            >
              {t('admin.nav.users')}
            </button>
          </div>
        </aside>

        <main className="admin-content">
        {tab === 'reports' && (
          <div>
            <div style={s.filterBar}>
              {reportTabs.map(({ key, label, icon }) => (
                <button
                  key={key}
                  style={reportStatus === key ? s.filterActive : s.filter}
                  onClick={() => setReportStatus(key)}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {reportsLoading ? (
              <Spinner />
            ) : reports.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>✨</div>
                <p style={s.emptyText}>{t('admin.reports.empty', { label: reportTabs.find(rt => rt.key === reportStatus)?.label ?? '' })}</p>
              </div>
            ) : (
              <div style={s.list}>
                {reports.map(r => (
                  <div key={r.report_id} style={s.card}>
                    <div style={s.cardTop}>
                      <span style={s.badgeGray}>{r.target_type === 'post' ? t('admin.report.post') : t('admin.report.comment')}</span>
                      <span style={s.reason}>{t('admin.report.reason', { reason: r.reason })}</span>
                      <span style={s.meta}>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p style={s.contentPreview}>
                      {r.target_removed ? t('admin.report.contentRemoved') : (r.content_preview || t('admin.report.contentMissing'))}
                    </p>
                    <div style={s.cardMeta}>
                      <span>{t('admin.report.author', { name: r.target_author_username || t('admin.report.unknownAuthor') })}</span>
                      <span>{t('admin.report.reporter', { name: r.reporter_username })}</span>
                    </div>
                    {r.status === 'pending' && (
                      <div style={s.actions}>
                        <button style={s.dangerBtn} onClick={() => handleResolve(r.report_id, 'remove')}>{t('admin.report.removeContent')}</button>
                        <button style={s.plainBtn} onClick={() => handleResolve(r.report_id, 'dismiss')}>{t('admin.report.dismiss')}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div>
            <form style={s.filterBar} onSubmit={handleUserSearch}>
              <input
                style={s.searchInput}
                placeholder={t('admin.users.searchPlaceholder')}
                value={userQuery}
                onChange={e => setUserQuery(e.target.value)}
              />
              <select style={s.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="">{t('admin.users.allRoles')}</option>
                <option value="user">{t('role.user')}</option>
                <option value="admin">{t('role.admin')}</option>
                <option value="super_admin">{t('role.superAdmin')}</option>
              </select>
              <button type="submit" style={s.plainBtn}>{t('common.search')}</button>
            </form>

            {usersLoading ? (
              <Spinner />
            ) : users.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>🔎</div>
                <p style={s.emptyText}>{t('admin.users.empty')}</p>
              </div>
            ) : (
              <div style={s.list}>
                {users.map(u => (
                  <div key={u.user_id} style={s.card}>
                    <div style={s.userRow}>
                      <Avatar name={u.username} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.cardTop}>
                          <span style={s.username}>{u.username}</span>
                          <span style={roleBadgeStyle(u.role)}>{roleLabel(u.role)}</span>
                          {u.is_banned && <span style={s.badgeRed}>{t('admin.badge.banned')}</span>}
                          {u.is_post_restricted && <span style={s.badgeAmber}>{t('admin.badge.restricted')}</span>}
                        </div>
                        <div style={s.cardMeta}>
                          <span>{u.email}</span>
                          <span>{t('admin.user.posts', { count: u.post_count })}</span>
                          <span>{t('admin.user.registeredAt', { date: new Date(u.created_at).toLocaleDateString() })}</span>
                        </div>
                        {u.is_banned && u.ban_reason && <p style={s.reasonNote}>{t('admin.user.banReason', { reason: u.ban_reason })}</p>}
                        {u.is_post_restricted && u.restricted_reason && <p style={s.reasonNoteAmber}>{t('admin.user.restrictReason', { reason: u.restricted_reason })}</p>}
                      </div>
                    </div>

                    {u.role !== 'super_admin' && (
                      <div style={s.actions}>
                        {u.is_banned
                          ? <button style={s.plainBtn} onClick={() => handleUnban(u)}>{t('admin.user.unban')}</button>
                          : <button style={s.dangerBtn} onClick={() => handleBan(u)}>{t('admin.user.ban')}</button>}
                        {u.is_post_restricted
                          ? <button style={s.plainBtn} onClick={() => handleUnrestrict(u)}>{t('admin.user.unrestrict')}</button>
                          : <button style={s.warnBtn} onClick={() => handleRestrict(u)}>{t('admin.user.restrict')}</button>}
                        <button style={s.dangerBtn} onClick={() => handleDeleteUser(u)}>{t('admin.user.delete')}</button>
                        {isSuperAdmin && u.role === 'user' && (
                          <button style={s.plainBtn} onClick={() => handlePromote(u)}>{t('admin.user.promote')}</button>
                        )}
                        {isSuperAdmin && u.role === 'admin' && (
                          <button style={s.plainBtn} onClick={() => handleDemote(u)}>{t('admin.user.demote')}</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </main>
      </div>

      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f4f5f7',
  },
  header: {
    position: 'sticky', top: 0, zIndex: 100,
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    padding: '0 24px', height: '56px',
    display: 'flex', alignItems: 'center', gap: '12px',
  },
  backBtn: {
    background: 'none', border: 'none',
    fontSize: '14px', color: '#6b7280',
    cursor: 'pointer', padding: '4px 8px',
  },
  logo: {
    fontSize: '18px', fontWeight: 700, color: '#4f46e5',
  },
  headerTitle: {
    fontSize: '13px', color: '#9ca3af',
  },
  userAvatar: {
    width: '56px', height: '56px', borderRadius: '50%',
    background: '#4f46e5', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '22px', fontWeight: 700, margin: '0 auto 10px',
  },
  userCardName: {
    textAlign: 'center', fontWeight: 600, fontSize: '15px', color: '#1a1a1a',
  },
  userCardEmail: {
    textAlign: 'center', fontSize: '12px', color: '#9ca3af',
    marginTop: '2px', marginBottom: '14px',
  },
  userStats: {
    display: 'flex', justifyContent: 'space-around',
    paddingTop: '12px', borderTop: '1px solid #f3f4f6',
  },
  statItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
  },
  statNum: {
    fontSize: '16px', fontWeight: 700, color: '#1a1a1a',
  },
  statLabel: {
    fontSize: '11px', color: '#9ca3af',
  },
  navCard: {
    background: '#fff', borderRadius: '10px', marginTop: '14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
    background: 'none', border: 'none', borderTop: '1px solid #f3f4f6',
    padding: '11px 14px', fontSize: '13.5px', color: '#6b7280',
    cursor: 'pointer', textAlign: 'left',
  },
  navItemActive: {
    display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
    background: '#eef2ff', border: 'none', borderTop: '1px solid #f3f4f6',
    padding: '11px 14px', fontSize: '13.5px', color: '#4f46e5', fontWeight: 600,
    cursor: 'pointer', textAlign: 'left',
  },
  filterBar: {
    display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
  },
  filter: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '999px',
    padding: '7px 16px', fontSize: '13px', color: '#6b7280', cursor: 'pointer',
    transition: 'all 0.15s',
  },
  filterActive: {
    background: '#4f46e5', border: '1px solid #4f46e5', borderRadius: '999px',
    padding: '7px 16px', fontSize: '13px', color: '#fff', cursor: 'pointer', fontWeight: 600,
  },
  searchInput: {
    flex: 1, border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '9px 14px', fontSize: '14px', outline: 'none', background: '#fff',
  },
  select: {
    border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff',
    padding: '9px 10px', fontSize: '14px', color: '#1a1a1a',
  },
  spinnerWrap: {
    display: 'flex', justifyContent: 'center', padding: '48px 0',
  },
  spinner: {
    width: '28px', height: '28px', borderRadius: '50%',
    border: '3px solid #e5e7eb', borderTopColor: '#4f46e5',
    animation: 'admin-spin 0.7s linear infinite',
  },
  emptyBox: {
    textAlign: 'center', padding: '60px 0',
  },
  emptyIcon: {
    fontSize: '32px', marginBottom: '8px',
  },
  emptyText: {
    color: '#9ca3af', fontSize: '14px', margin: 0,
  },
  list: {
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  card: {
    background: '#fff', borderRadius: '10px', padding: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  userRow: {
    display: 'flex', gap: '12px', marginBottom: '10px',
  },
  avatar: {
    width: '38px', height: '38px', borderRadius: '50%',
    background: '#4f46e5', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 600, fontSize: '15px', flexShrink: 0,
  },
  cardTop: {
    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px',
  },
  username: {
    fontSize: '15px', fontWeight: 700, color: '#1a1a1a',
  },
  badgeGray: {
    background: '#f3f4f6', color: '#4b5563', fontSize: '12px', fontWeight: 600,
    borderRadius: '6px', padding: '3px 9px',
  },
  badgeBlue: {
    background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: 600,
    borderRadius: '6px', padding: '3px 9px',
  },
  badgePurple: {
    background: '#ede9fe', color: '#4f46e5', fontSize: '12px', fontWeight: 600,
    borderRadius: '6px', padding: '3px 9px',
  },
  badgeRed: {
    background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 600,
    borderRadius: '6px', padding: '3px 9px',
  },
  badgeAmber: {
    background: '#fffbeb', color: '#d97706', fontSize: '12px', fontWeight: 600,
    borderRadius: '6px', padding: '3px 9px',
  },
  reason: {
    fontSize: '13px', color: '#374151',
  },
  meta: {
    fontSize: '12px', color: '#9ca3af', marginLeft: 'auto',
  },
  contentPreview: {
    fontSize: '14px', color: '#1a1a1a', background: '#f9fafb',
    borderRadius: '8px', padding: '10px 12px', margin: '0 0 10px 0',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
  },
  cardMeta: {
    display: 'flex', gap: '14px', fontSize: '12px', color: '#9ca3af', marginBottom: '4px', flexWrap: 'wrap',
  },
  reasonNote: {
    fontSize: '13px', color: '#dc2626', margin: '6px 0 0 0',
  },
  reasonNoteAmber: {
    fontSize: '13px', color: '#d97706', margin: '6px 0 0 0',
  },
  actions: {
    display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px',
  },
  dangerBtn: {
    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
    borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    transition: 'background 0.15s',
  },
  warnBtn: {
    background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a',
    borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  plainBtn: {
    background: '#f4f5f7', color: '#374151', border: '1px solid #e5e7eb',
    borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: '20px',
  },
  dialog: {
    background: '#fff', borderRadius: '14px', padding: '22px',
    width: '100%', maxWidth: '380px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
  },
  dialogTitle: {
    fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px 0',
  },
  dialogMessage: {
    fontSize: '13px', color: '#6b7280', margin: '0 0 14px 0', lineHeight: 1.5,
  },
  dialogInput: {
    width: '100%', minHeight: '72px', border: '1px solid #e5e7eb', borderRadius: '10px',
    padding: '10px 12px', fontSize: '14px', outline: 'none', resize: 'vertical',
    fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '16px',
  },
  dialogActions: {
    display: 'flex', justifyContent: 'flex-end', gap: '8px',
  },
  dialogCancel: {
    background: '#f4f5f7', color: '#374151', border: 'none',
    borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  dialogConfirm: {
    background: '#4f46e5', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  dialogConfirmDanger: {
    background: '#dc2626', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
}

export default AdminDashboard
