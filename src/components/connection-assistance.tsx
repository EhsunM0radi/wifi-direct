"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getConnectionAssistance, ConnectionAssistanceOutput } from '@/ai/flows/connection-assistance';
import { Wand2 } from 'lucide-react';

export function ConnectionAssistance() {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<ConnectionAssistanceOutput | null>(null);
    const [networkConditions, setNetworkConditions] = useState('');
    const [transferStatus, setTransferStatus] = useState('');

    const handleSubmit = async () => {
        setIsLoading(true);
        setResult(null);
        try {
            const response = await getConnectionAssistance({ networkConditions, transferStatus });
            setResult(response);
        } catch (error) {
            console.error("Error getting connection assistance:", error);
            setResult({ likelyCause: "An error occurred.", suggestedAdjustments: "Please try again." });
        }
        setIsLoading(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Wand2 className="mr-2 h-4 w-4" />
                    Connection Assistance
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Connection Assistance</DialogTitle>
                    <DialogDescription>
                        Describe your connection issues to get AI-powered suggestions for improving transfer stability and speed.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid w-full gap-1.5">
                        <Label htmlFor="network-conditions">Network Conditions</Label>
                        <Textarea
                            id="network-conditions"
                            placeholder="e.g., Weak WiFi signal, frequent disconnects..."
                            value={networkConditions}
                            onChange={(e) => setNetworkConditions(e.target.value)}
                        />
                    </div>
                    <div className="grid w-full gap-1.5">
                        <Label htmlFor="transfer-status">Transfer Status</Label>
                        <Textarea
                            id="transfer-status"
                            placeholder="e.g., Transfer is very slow, fails after a few seconds..."
                            value={transferStatus}
                            onChange={(e) => setTransferStatus(e.target.value)}
                        />
                    </div>
                </div>

                {result && (
                    <div className="space-y-4 rounded-md border bg-secondary/50 p-4">
                        <div>
                            <h4 className="font-semibold">Most Likely Cause</h4>
                            <p className="text-sm text-muted-foreground">{result.likelyCause}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold">Suggested Adjustments</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.suggestedAdjustments}</p>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isLoading || !networkConditions || !transferStatus}>
                        {isLoading ? 'Analyzing...' : 'Get Suggestions'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
