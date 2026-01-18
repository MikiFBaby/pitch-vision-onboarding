import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getRecentCalls } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Bot, UploadCloud } from "lucide-react";

export default function RecentCallsTable() {
    const calls = getRecentCalls();

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="glass-card rounded-2xl border-white/5 overflow-hidden"
        >
            <Table>
                <TableHeader className="bg-white/5">
                    <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4">Call ID</TableHead>
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4">Date</TableHead>
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4">Customer</TableHead>
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4">Duration</TableHead>
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 text-center">Source</TableHead>
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 text-center">Score</TableHead>
                        <TableHead className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {calls.map((call, index) => (
                        <motion.tr
                            key={call.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                            className="group border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                            <TableCell className="font-mono text-xs text-white/60 py-4 group-hover:text-white transition-colors">
                                #{call.id}
                            </TableCell>
                            <TableCell className="text-xs text-white/40 py-4">{call.date}</TableCell>
                            <TableCell className="text-xs font-medium text-white/80 py-4">{call.customer}</TableCell>
                            <TableCell className="text-xs text-white/40 py-4">{call.duration}</TableCell>
                            <TableCell className="py-4 text-center">
                                <div className="flex justify-center">
                                    {call.uploadType === 'automated' ? (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100/5 border border-white/10 text-white/60" title="Automated">
                                            <Bot size={10} className="text-purple-400" />
                                            <span className="text-[9px] font-bold uppercase tracking-wider">Auto</span>
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100/5 border border-white/10 text-white/60" title="Manual">
                                            <UploadCloud size={10} className="text-blue-400" />
                                            <span className="text-[9px] font-bold uppercase tracking-wider">Manual</span>
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="py-4">
                                <div className="flex justify-center">
                                    <span className={cn(
                                        "text-xs font-bold px-2 py-0.5 rounded",
                                        call.score >= 90 ? "bg-green-500/10 text-green-400" :
                                            call.score >= 80 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
                                    )}>
                                        {call.score}%
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="text-right py-4">
                                <Badge variant="outline" className="border-white/10 text-white/40 bg-white/5 text-[10px] font-bold uppercase tracking-tighter">
                                    {call.status}
                                </Badge>
                            </TableCell>
                        </motion.tr>
                    ))}
                </TableBody>
            </Table>
        </motion.div>
    );
}
