'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import IFAPreviewModal from '@/components/commission/IFAPreviewModal'

interface IFABalance {
  current_balance: number
  suspended_balance: number
  total_earned: number
  total_paid: number
}

interface IFA {
  id: string
  code: string
  name: string
  email: string
  status: string
  role: string
  user_id: string | null
  ifa_balances: IFABalance[] | null
}

interface IFAFormData {
  code: string
  name: string
  email: string
  status: string
}

const EMPTY_FORM: IFAFormData = { code: '', name: '', email: '', status: 'active' }

export default function IFAManagementPage() {
  const router = useRouter()
  const [ifas, setIfas] = useState<IFA[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<IFAFormData>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteAlreadyRegistered, setInviteAlreadyRegistered] = useState(false)

  // Resend invite
  const [resendingId, setResendingId] = useState<string | null>(null)

  // Delete IFA
  const [deleteTarget, setDeleteTarget] = useState<IFA | null>(null)
  const [deleting, setDeleting] = useState(false)

  // IFA preview modal
  const [previewIFA, setPreviewIFA] = useState<IFA | null>(null)

  // Inline action feedback
  const [actionMsg, setActionMsg] = useState('')

  const loadIFAs = useCallback(async () => {
    setLoading(true)
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/ifas', { headers: authHeaders })
    const { ifas: data } = await res.json()
    setIfas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadIFAs() }, [loadIFAs])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = ifas.filter(ifa => {
    if (statusFilter !== 'all' && ifa.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return ifa.name.toLowerCase().includes(q) || ifa.code.toLowerCase().includes(q) || ifa.email.toLowerCase().includes(q)
    }
    return true
  })

  // ── Create / Edit ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setModalMode('create')
    setModalError('')
    setInviteSent(false)
    setInviteAlreadyRegistered(false)
  }

  const openEdit = (ifa: IFA) => {
    setForm({ code: ifa.code, name: ifa.name, email: ifa.email, status: ifa.status })
    setEditingId(ifa.id)
    setModalMode('edit')
    setModalError('')
    setInviteSent(false)
    setInviteAlreadyRegistered(false)
  }

  const handleSave = async () => {
    if (!form.code || !form.name || !form.email) {
      setModalError('Code, name and email are required')
      return
    }
    setSaving(true)
    setModalError('')

    try {
      if (modalMode === 'create') {
        const authHeaders = await getAuthHeaders()
        const res = await fetch('/api/commission/ifas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setInviteSent(data.invite_sent)
        setInviteAlreadyRegistered(!!data.already_registered)
        await loadIFAs()
        if (!data.invite_sent) {
          setModalError('Could not send invite email — check server logs for details.')
        } else {
          setTimeout(() => setModalMode(null), 2500)
        }
      } else {
        const authHeaders = await getAuthHeaders()
        const res = await fetch(`/api/commission/ifas/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        await loadIFAs()
        setModalMode(null)
      }
    } catch (err: any) {
      setModalError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Resend invite ────────────────────────────────────────────────────────────
  const handleResendInvite = async (id: string) => {
    setResendingId(id)
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`/api/commission/ifas/${id}`, { method: 'PATCH', headers: authHeaders })
    const data = await res.json()
    setResendingId(null)
    setActionMsg(
      !data.invite_sent
        ? `Failed: ${data.error}`
        : data.already_registered
          ? 'That email already has an account — sent a password-reset link instead of an invite.'
          : 'Invite email re-sent.'
    )
    setTimeout(() => setActionMsg(''), 5000)
  }

  // ── Deactivate / Reactivate ──────────────────────────────────────────────────
  const handleToggleStatus = async (ifa: IFA) => {
    const newStatus = ifa.status === 'active' ? 'inactive' : 'active'
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`/api/commission/ifas/${ifa.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ ...ifa, status: newStatus }),
    })
    if (res.ok) {
      setActionMsg(`${ifa.name} marked as ${newStatus}.`)
      setTimeout(() => setActionMsg(''), 4000)
      await loadIFAs()
    }
  }

  // ── Hard delete IFA ──────────────────────────────────────────────────────────
  const handleDeleteIFA = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch(`/api/commission/ifas/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg(`Delete failed: ${data.error}`)
      } else {
        const msg = data.reassigned_to
          ? `${deleteTarget.name} deleted. Records reassigned to canonical IFA.`
          : `${deleteTarget.name} deleted.`
        setActionMsg(msg)
        await loadIFAs()
      }
    } catch (err: any) {
      setActionMsg(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
      setTimeout(() => setActionMsg(''), 5000)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const balance = (ifa: IFA) => ifa.ifa_balances?.[0]?.current_balance ?? 0

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <button
          onClick={() => router.push('/commission/admin')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors"
        >
          ← Back to Admin
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--wgi-text)' }}>IFA Management</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--wgi-text-muted)' }}>Create, edit and manage IFA accounts</p>
          </div>
          <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            + Create IFA
          </button>
        </div>

        {/* Action feedback */}
        {actionMsg && (
          <div className={`${actionMsg.toLowerCase().startsWith('delete failed') || actionMsg.toLowerCase().startsWith('failed') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'} border px-4 py-3 rounded-md text-sm`}>
            {actionMsg}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <input
            type="text"
            placeholder="Search name, code or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <p className="text-sm text-gray-500 whitespace-nowrap">{filtered.length} IFAs</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No IFAs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Code', 'Name', 'Email', 'Status', 'Balance', 'Auth', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.map(ifa => (
                    <tr key={ifa.id} className={ifa.status === 'inactive' ? 'opacity-60' : ''}>
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{ifa.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{ifa.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{ifa.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ifa.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {ifa.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatCurrency(balance(ifa), 'USD')}
                      </td>
                      <td className="px-4 py-3">
                        {ifa.user_id ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            Linked
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewIFA(ifa)}
                            className="text-xs text-indigo-600 hover:underline font-medium"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => openEdit(ifa)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                          {!ifa.user_id && (
                            <button
                              onClick={() => handleResendInvite(ifa.id)}
                              disabled={resendingId === ifa.id}
                              className="text-xs text-purple-600 hover:underline disabled:opacity-40"
                            >
                              {resendingId === ifa.id ? '…' : 'Resend Invite'}
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleStatus(ifa)}
                            className={`text-xs hover:underline ${ifa.status === 'active' ? 'text-red-600' : 'text-green-600'}`}
                          >
                            {ifa.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(ifa)}
                            className="text-xs text-red-700 hover:underline font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-700">Delete IFA — Permanent Action</h2>
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-800 space-y-1">
              <p className="font-medium">You are about to permanently delete:</p>
              <p>{deleteTarget.name} <span className="font-mono">({deleteTarget.code})</span></p>
              <p className="mt-2">All commission records and payment batches linked to this IFA will be reassigned to another IFA with the same code, if one exists. This cannot be undone.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteIFA}
                disabled={deleting}
                className="flex-1 bg-red-700 text-white py-2 rounded-md text-sm font-medium hover:bg-red-800 disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IFA Preview Modal ───────────────────────────────────────────────── */}
      {previewIFA && (
        <IFAPreviewModal
          ifaCode={previewIFA.code}
          ifaName={previewIFA.name}
          onClose={() => setPreviewIFA(null)}
        />
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {modalMode === 'create' ? 'Create New IFA' : 'Edit IFA'}
            </h2>

            {inviteSent && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
                {inviteAlreadyRegistered
                  ? 'IFA created. That email already has an account — sent a password-reset link instead of an invite.'
                  : 'IFA created and invite email sent!'}
              </div>
            )}

            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {modalError}
              </div>
            )}

            {[
              { key: 'code', label: 'IFA Code', placeholder: 'e.g. WGI001' },
              { key: 'name', label: 'Full Name', placeholder: 'John Smith' },
              { key: 'email', label: 'Email Address', placeholder: 'john@example.com', type: 'email' },
            ].map(({ key, label, placeholder, type = 'text' }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {modalMode === 'create' && (
              <p className="text-xs text-gray-500">
                An invite email will be sent to the address above so the IFA can set their password.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setModalMode(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? 'Saving…' : modalMode === 'create' ? 'Create & Invite' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
