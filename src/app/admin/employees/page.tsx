"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Plus, Mail, Shield, User as UserIcon, LogOut, Search, MoreVertical, X } from 'lucide-react';
import { cn } from "@/lib/utils";

// --- TYPES ---
interface Employee {
    id: string;
    email: string;
    role: 'agent' | 'qa' | 'manager' | 'executive';
    first_name: string;
    last_name: string;
    status: 'active' | 'inactive' | 'suspended' | 'pending_approval';
    last_login: string | null;
    created_at: string;
}

// --- COMPONENTS ---

const NavItem = ({ icon: Icon, label, active = false }: { icon: any, label: string, active?: boolean }) => (
    <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl cursor-not-allowed transition-all",
        active ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
    )}>
        <Icon className="w-5 h-5" />
        <span className="font-medium">{label}</span>
    </div>
);

const RoleBadge = ({ role }: { role: string }) => {
    const styles = {
        agent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        qa: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        manager: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        executive: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    };
    return (
        <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border tracking-wider", styles[role as keyof typeof styles])}>
            {role}
        </span>
    );
};

export default function AdminEmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [inviteForm, setInviteForm] = useState({
        email: '',
        role: 'agent',
        firstName: '',
        lastName: ''
    });

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/admin/employees');
            const data = await response.json();
            setEmployees(data.employees || []);
        } catch (err) {
            console.error("Failed to fetch employees", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInviteEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        try {
            const response = await fetch('/api/admin/invite-employee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inviteForm)
            });
            const data = await response.json();
            if (data.success) {
                alert('Invitation sent successfully!');
                setShowInviteModal(false);
                setInviteForm({ email: '', role: 'agent', firstName: '', lastName: '' });
                fetchEmployees();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (err) {
            alert('Failed to send invitation');
        } finally {
            setIsInviting(false);
        }
    };

    const filteredEmployees = employees.filter(emp =>
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-black text-white flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 p-6 flex flex-col gap-8">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                        <Shield className="w-5 h-5 text-black" />
                    </div>
                    <span className="text-xl font-bold tracking-tighter">PITCH VISION</span>
                </div>

                <nav className="flex-1 flex flex-col gap-2">
                    <NavItem icon={Plus} label="Dashboard" />
                    <NavItem icon={UserIcon} label="Team Management" active />
                    <NavItem icon={LogOut} label="System Logs" />
                </nav>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30" />
                        <div>
                            <div className="text-sm font-semibold">Executive Admin</div>
                            <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest">System Master</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-10 overflow-auto">
                <header className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-4xl font-light tracking-tighter mb-2">Team Intelligence</h1>
                        <p className="text-white/40">Manage your workforce and orchestrate collaborative growth.</p>
                    </div>
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 active:scale-95 transition-all shadow-lg"
                    >
                        <Plus className="w-5 h-5" />
                        Invite Member
                    </button>
                </header>

                {/* Stats Strip */}
                <div className="grid grid-cols-4 gap-6 mb-10">
                    {[
                        { label: 'Active Users', value: employees.filter(e => e.status === 'active').length, color: 'text-white' },
                        { label: 'Pending Invitations', value: '4', color: 'text-white/40' },
                        { label: 'Avg Performance', value: '94%', color: 'text-cyan-400' },
                        { label: 'System Health', value: 'Optimal', color: 'text-emerald-400' },
                    ].map((stat, i) => (
                        <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/10">
                            <div className="text-xs text-white/40 uppercase font-bold tracking-widest mb-2">{stat.label}</div>
                            <div className={cn("text-3xl font-light tracking-tighter", stat.color)}>{stat.value}</div>
                        </div>
                    ))}
                </div>

                {/* List Section */}
                <div className="rounded-3xl bg-white/[0.03] border border-white/10 overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                        <div className="relative w-96 font-geist">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input
                                type="text"
                                placeholder="Search intelligence hub..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-white/20 transition-all font-sans"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                                <MoreVertical className="w-4 h-4 text-white/40" />
                            </button>
                        </div>
                    </div>

                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="text-left bg-white/[0.01]">
                                <th className="px-8 py-5 text-sm font-semibold text-white/40 border-b border-white/5">Member</th>
                                <th className="px-8 py-5 text-sm font-semibold text-white/40 border-b border-white/5">Role</th>
                                <th className="px-8 py-5 text-sm font-semibold text-white/40 border-b border-white/5">Status</th>
                                <th className="px-8 py-5 text-sm font-semibold text-white/40 border-b border-white/5 text-right">Last Sync</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-8 py-20 text-center text-white/20 animate-pulse">Synchronizing database...</td></tr>
                            ) : filteredEmployees.map((emp) => (
                                <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-xs font-bold font-sans">
                                                {emp.first_name?.[0]}{emp.last_name?.[0]}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-white tracking-tight">{emp.first_name} {emp.last_name}</div>
                                                <div className="text-xs text-white/40">{emp.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <RoleBadge role={emp.role} />
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-1.5 h-1.5 rounded-full", emp.status === 'active' ? "bg-emerald-400" : "bg-white/20")} />
                                            <span className={cn("text-xs font-medium", emp.status === 'active' ? "text-emerald-400" : "text-white/40 capitalize")}>{emp.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <span className="text-xs text-white/40 font-mono">
                                            {emp.last_login ? new Date(emp.last_login).toLocaleDateString() : 'DISCONNECTED'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setShowInviteModal(false)} />
                    <div className="relative w-full max-w-lg bg-black/40 border border-white/10 rounded-[32px] p-10 shadow-2xl animate-element">
                        <button
                            onClick={() => setShowInviteModal(false)}
                            className="absolute top-8 right-8 p-2 rounded-full hover:bg-white/5 transition-all"
                        >
                            <X className="w-6 h-6 text-white/40" />
                        </button>

                        <h2 className="text-4xl font-light tracking-tighter mb-2">New Recruitment</h2>
                        <p className="text-white/40 mb-8">Deploy a new operative to the collective intelligence network.</p>

                        <form onSubmit={handleInviteEmployee} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold tracking-widest text-white/40 ml-1">First Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={inviteForm.firstName}
                                        onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-purple-500/50 transition-all font-sans"
                                        placeholder="Jane"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold tracking-widest text-white/40 ml-1">Last Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={inviteForm.lastName}
                                        onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-purple-500/50 transition-all font-sans"
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold tracking-widest text-white/40 ml-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                    <input
                                        type="email"
                                        required
                                        value={inviteForm.email}
                                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-purple-500/50 transition-all font-sans"
                                        placeholder="jane.doe@pitchvision.ai"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold tracking-widest text-white/40 ml-1">Assigned Role</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['agent', 'qa', 'manager', 'executive'].map((role) => (
                                        <button
                                            key={role}
                                            type="button"
                                            onClick={() => setInviteForm({ ...inviteForm, role })}
                                            className={cn(
                                                "py-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all",
                                                inviteForm.role === role
                                                    ? "bg-white text-black border-white shadow-lg"
                                                    : "bg-white/5 text-white/40 border-white/10 hover:border-white/20"
                                            )}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isInviting}
                                className="w-full bg-white text-black py-4 rounded-2xl font-bold hover:bg-white/90 active:scale-[0.98] transition-all mt-4 disabled:opacity-50"
                            >
                                {isInviting ? "TRANSMITTING..." : "AUTHORIZE ACCESS"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
