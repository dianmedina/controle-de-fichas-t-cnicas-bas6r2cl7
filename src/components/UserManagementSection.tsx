import React, { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth, AppUser, UserRole } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  UserPlus,
  ShieldCheck,
  ChefHat,
  KeyRound,
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
  AlertCircle,
} from 'lucide-react'

export function UserManagementSection() {
  const { user: currentUser, refreshUser } = useAuth()
  const { toast } = useToast()

  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  // Modal Criar Usuário
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('')
  const [createRole, setCreateRole] = useState<UserRole>('cozinha')
  const [creating, setCreating] = useState(false)

  // Modal Editar Perfil / Status do Usuário
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('cozinha')
  const [editActive, setEditActive] = useState<boolean>(true)
  const [savingEdit, setSavingEdit] = useState(false)

  // Modal Alterar Senha de um Usuário
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const loadUsers = async () => {
    try {
      setLoading(true)
      const records = await pb.collection('users').getFullList<AppUser>({
        sort: '-created',
      })
      setUsers(records)
    } catch (err) {
      console.error('Erro ao carregar usuários:', err)
      toast({
        title: 'Erro ao carregar usuários',
        description: 'Não foi possível buscar a lista de usuários cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleOpenCreate = () => {
    setCreateName('')
    setCreateEmail('')
    setCreatePassword('')
    setCreatePasswordConfirm('')
    setCreateRole('cozinha')
    setIsCreateOpen(true)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createEmail.trim() || !createPassword.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'E-mail e senha são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    if (createPassword.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve conter ao menos 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (createPassword !== createPasswordConfirm) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha não confere.',
        variant: 'destructive',
      })
      return
    }

    try {
      setCreating(true)
      await pb.collection('users').create({
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        passwordConfirm: createPasswordConfirm,
        name: createName.trim() || createEmail.trim().split('@')[0],
        role: createRole,
        active: true,
      })

      toast({
        title: 'Usuário cadastrado com sucesso!',
        description: `O acesso para ${createEmail.trim()} (${createRole === 'gestor' ? 'Gestor' : 'Cozinha'}) foi criado.`,
      })
      setIsCreateOpen(false)
      loadUsers()
    } catch (err: unknown) {
      console.error('Erro ao criar usuário:', err)
      const msg =
        err instanceof Error
          ? err.message
          : 'Falha ao criar o usuário. Verifique se o e-mail já existe.'
      toast({
        title: 'Erro ao criar usuário',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleOpenEdit = (user: AppUser) => {
    setEditingUser(user)
    setEditRole(user.role || 'cozinha')
    setEditActive(user.active !== false)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    // Proteção: o usuário gestor logado não pode desativar a si mesmo nem remover seu próprio perfil gestor
    if (editingUser.id === currentUser?.id) {
      if (!editActive) {
        toast({
          title: 'Operação não permitida',
          description: 'Você não pode desativar sua própria conta de gestor conectada.',
          variant: 'destructive',
        })
        return
      }
      if (editRole !== 'gestor') {
        toast({
          title: 'Operação não permitida',
          description: 'Você não pode retirar seu próprio acesso de gestor.',
          variant: 'destructive',
        })
        return
      }
    }

    try {
      setSavingEdit(true)
      await pb.collection('users').update(editingUser.id, {
        role: editRole,
        active: editActive,
      })
      toast({
        title: 'Usuário atualizado com sucesso!',
        description: `As permissões de ${editingUser.email} foram salvas.`,
      })
      setEditingUser(null)
      loadUsers()
      if (editingUser.id === currentUser?.id) {
        refreshUser()
      }
    } catch (err) {
      console.error('Erro ao atualizar usuário:', err)
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível salvar as alterações do usuário.',
        variant: 'destructive',
      })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleOpenPassword = (user: AppUser) => {
    setPasswordUser(user)
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordUser) return

    if (newPassword.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A nova senha deve ter no mínimo 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (newPassword !== newPasswordConfirm) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha não confere.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingPassword(true)
      await pb.collection('users').update(passwordUser.id, {
        password: newPassword,
        passwordConfirm: newPasswordConfirm,
      })
      toast({
        title: 'Senha redefinida com sucesso!',
        description: `A nova senha de ${passwordUser.email} foi aplicada.`,
      })
      setPasswordUser(null)
    } catch (err) {
      console.error('Erro ao alterar senha:', err)
      toast({
        title: 'Erro ao alterar senha',
        description: 'Não foi possível redefinir a senha deste usuário.',
        variant: 'destructive',
      })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-xs">
      <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            Gestão de Usuários e Níveis de Acesso
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Controle quem tem acesso total (Gestor) e quem acessa apenas o modo operacional da
            Cozinha (sem custos).
          </CardDescription>
        </div>
        <Button
          onClick={handleOpenCreate}
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center gap-1.5 self-start sm:self-auto text-xs font-semibold"
        >
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="p-4 bg-slate-50/60 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2 bg-amber-50/60 p-3 rounded-lg border border-amber-200/60">
            <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950">Perfil Gestor</p>
              <p className="text-amber-900/80 mt-0.5">
                Acesso total: Dashboard, Insumos, Fichas com custos, Preços & Vendas, Configurações
                e Gestão de Usuários.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-blue-50/60 p-3 rounded-lg border border-blue-200/60">
            <ChefHat className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-blue-950">Perfil Cozinha</p>
              <p className="text-blue-900/80 mt-0.5">
                Acesso restrito: Fichas Técnicas operacionais com fotos, modo de preparo e impressão
                sem valores em R$.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            <p className="text-sm">Carregando usuários...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Nenhum usuário cadastrado encontrado.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/75">
              <TableRow>
                <TableHead className="font-semibold text-slate-700">Usuário</TableHead>
                <TableHead className="font-semibold text-slate-700">Perfil</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">Status</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isYou = u.id === currentUser?.id
                const isUserGestor = u.role === 'gestor'
                const isActive = u.active !== false

                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 border ${
                            isUserGestor
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-blue-100 text-blue-800 border-blue-200'
                          }`}
                        >
                          {isUserGestor ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <ChefHat className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {u.name || 'Sem nome'}
                            </span>
                            {isYou && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-100 text-slate-600 border-slate-300"
                              >
                                Você
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">{u.email}</span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {isUserGestor ? (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-semibold text-xs">
                          Gestor (Total)
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold text-xs">
                          Cozinha (Restrito)
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <XCircle className="h-3 w-3" />
                          Desativado
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(u)}
                          className="h-8 text-xs border-slate-300 hover:border-amber-600 hover:text-amber-800 gap-1"
                          title="Alterar perfil ou ativar/desativar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Perfil
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPassword(u)}
                          className="h-8 text-xs text-slate-600 hover:text-amber-800 hover:bg-amber-50 gap-1"
                          title="Trocar senha deste usuário"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Senha
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal Criar Novo Usuário */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-amber-600" />
                Novo Usuário do Sistema
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastre um membro da equipe com perfil Gestor (total) ou Cozinha (operacional sem
                custos).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="user-name" className="text-xs font-semibold">
                  Nome Completo
                </Label>
                <Input
                  id="user-name"
                  placeholder="Ex.: Chef Carlos ou Equipe de Saladas"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-email" className="text-xs font-semibold">
                  E-mail de Login *
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  placeholder="exemplo@restaurante.com"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="user-pass" className="text-xs font-semibold">
                    Senha (mín. 8) *
                  </Label>
                  <Input
                    id="user-pass"
                    type="password"
                    placeholder="••••••••"
                    required
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-pass-conf" className="text-xs font-semibold">
                    Confirmar Senha *
                  </Label>
                  <Input
                    id="user-pass-conf"
                    type="password"
                    placeholder="••••••••"
                    required
                    value={createPasswordConfirm}
                    onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-role" className="text-xs font-semibold">
                  Perfil de Acesso *
                </Label>
                <Select value={createRole} onValueChange={(val: UserRole) => setCreateRole(val)}>
                  <SelectTrigger id="user-role" className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cozinha">
                      <div className="flex items-center gap-2">
                        <ChefHat className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Cozinha</span>
                        <span className="text-xs text-slate-400">— apenas fichas sem custos</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="gestor">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-amber-600" />
                        <span className="font-medium">Gestor</span>
                        <span className="text-xs text-slate-400">
                          — acesso total a custos e cardápio
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {createRole === 'cozinha'
                    ? 'O perfil Cozinha entra direto na lista de fichas e não vê nenhum valor em R$.'
                    : 'O perfil Gestor tem acesso completo a custos, margens, preços e configurações.'}
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={creating}
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cadastrar Usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Perfil / Status */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-600" />
                Editar Perfil do Usuário
              </DialogTitle>
              <DialogDescription className="text-xs">
                Modifique o nível de acesso e o status de ativação da conta.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                <p className="font-semibold text-slate-900">{editingUser?.name || 'Sem nome'}</p>
                <p className="text-slate-500">{editingUser?.email}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-role" className="text-xs font-semibold">
                  Perfil de Acesso
                </Label>
                <Select value={editRole} onValueChange={(val: UserRole) => setEditRole(val)}>
                  <SelectTrigger id="edit-role" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cozinha">Cozinha (sem custos)</SelectItem>
                    <SelectItem value="gestor">Gestor (acesso total)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-active" className="text-xs font-semibold">
                  Status da Conta
                </Label>
                <Select
                  value={editActive ? 'active' : 'inactive'}
                  onValueChange={(val) => setEditActive(val === 'active')}
                >
                  <SelectTrigger id="edit-active" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">
                      <span className="text-emerald-700 font-medium">Ativo (pode fazer login)</span>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <span className="text-red-700 font-medium">Desativado (bloqueado)</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingUser(null)}
                disabled={savingEdit}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={savingEdit}
              >
                {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Redefinir Senha */}
      <Dialog open={!!passwordUser} onOpenChange={() => setPasswordUser(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSavePassword}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-600" />
                Redefinir Senha de Acesso
              </DialogTitle>
              <DialogDescription className="text-xs">
                Defina uma nova senha para o usuário {passwordUser?.email}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-xs font-semibold">
                  Nova Senha (mín. 8 caracteres) *
                </Label>
                <Input
                  id="new-pass"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-pass-confirm" className="text-xs font-semibold">
                  Confirmar Nova Senha *
                </Label>
                <Input
                  id="new-pass-confirm"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  O usuário precisará usar essa nova senha para se conectar no próximo login.
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPasswordUser(null)}
                disabled={savingPassword}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={savingPassword}
              >
                {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Nova Senha
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
