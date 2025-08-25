"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Download, Link, CircleDashed, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import type { FileMetadata, TransferProgress } from '@/lib/types';
import { ConnectionAssistance } from './connection-assistance';
import { Logo } from './icons';

type AppState = 'idle' | 'creating' | 'joining' | 'connected';

const CHUNK_SIZE = 65536; // 64KB

export default function WifiDirectApp() {
    const [appState, setAppState] = useState<AppState>('idle');
    const [roomId, setRoomId] = useState('');
    const [inputRoomId, setInputRoomId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<TransferProgress>({});

    const pc = useRef<RTCPeerConnection | null>(null);
    const dc = useRef<RTCDataChannel | null>(null);
    const fileToSend = useRef<File | null>(null);
    const fileReceiver = useRef<{ meta: FileMetadata | null; receivedSize: number; buffer: ArrayBuffer[] }>({
        meta: null,
        receivedSize: 0,
        buffer: [],
    }).current;

    const { toast } = useToast();

    const cleanup = useCallback(async () => {
        if (dc.current) dc.current.close();
        if (pc.current) pc.current.close();
        pc.current = null;
        dc.current = null;
        
        if (roomId) {
            try {
                const roomRef = doc(db, 'rooms', roomId);
                const roomSnap = await getDoc(roomRef);
                if (roomSnap.exists()) {
                     await deleteDoc(roomRef);
                }
            } catch (error) {
                console.error("Error cleaning up room:", error);
            }
        }

        setAppState('idle');
        setRoomId('');
        setInputRoomId('');
        setProgress({});
        setIsLoading(false);
    }, [roomId]);

    const setupDataChannel = useCallback(() => {
        if (!pc.current) return;
        
        pc.current.ondatachannel = (event) => {
            dc.current = event.channel;
            dc.current.onmessage = handleDataChannelMessage;
            dc.current.onopen = () => setAppState('connected');
            dc.current.onclose = () => {
                toast({ title: "Connection closed" });
                cleanup();
            };
        };
    }, [toast, cleanup]);

    const handleDataChannelMessage = (event: MessageEvent) => {
        const { data } = event;

        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data);
                if (message.type === 'metadata') {
                    fileReceiver.meta = message.payload;
                    fileReceiver.receivedSize = 0;
                    fileReceiver.buffer = [];
                    setProgress(prev => ({ ...prev, [message.payload.name]: { transferred: 0, total: message.payload.size, completed: false } }));
                } else if (message.type === 'eof') {
                    if (!fileReceiver.meta) return;

                    const receivedBlob = new Blob(fileReceiver.buffer);
                    const url = URL.createObjectURL(receivedBlob);
                    
                    setProgress(prev => ({
                        ...prev,
                        [fileReceiver.meta!.name]: { ...prev[fileReceiver.meta!.name], completed: true, url }
                    }));

                    fileReceiver.meta = null;
                    fileReceiver.buffer = [];
                    
                    toast({ title: "File received!", description: `Ready to download ${message.payload.name}` });
                }
            } catch (e) { console.error(e) }
        } else { // ArrayBuffer
            if (!fileReceiver.meta) return;
            
            fileReceiver.buffer.push(data);
            fileReceiver.receivedSize += data.byteLength;
            
            setProgress(prev => ({
                ...prev,
                [fileReceiver.meta!.name]: { ...prev[fileReceiver.meta!.name], transferred: fileReceiver.receivedSize }
            }));
        }
    };

    const createRoom = async () => {
        setIsLoading(true);
        setAppState('creating');
        pc.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        setupDataChannel();

        dc.current = pc.current.createDataChannel('sendChannel');
        dc.current.onmessage = handleDataChannelMessage;
        dc.current.onopen = () => setAppState('connected');
        dc.current.onclose = () => {
            toast({ title: "Connection closed" });
            cleanup();
        };

        const roomRef = doc(collection(db, 'rooms'));
        const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
        setRoomId(roomRef.id);
        
        pc.current.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(callerCandidatesCollection, event.candidate.toJSON());
            }
        };

        const offer = await pc.current.createOffer();
        await pc.current.setLocalDescription(offer);

        const roomWithOffer = { offer: { type: offer.type, sdp: offer.sdp } };
        await setDoc(roomRef, roomWithOffer);

        onSnapshot(roomRef, (snapshot) => {
            const data = snapshot.data();
            if (!pc.current?.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.current.setRemoteDescription(answerDescription);
            }
        });

        const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
        onSnapshot(calleeCandidatesCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.current?.addIceCandidate(candidate);
                }
            });
        });
        setIsLoading(false);
    };

    const joinRoom = async () => {
        if (!inputRoomId) return;
        setIsLoading(true);
        setAppState('joining');
        
        const roomRef = doc(db, 'rooms', inputRoomId);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            toast({ title: "Error", description: "Room not found.", variant: "destructive" });
            setAppState('idle');
            setIsLoading(false);
            return;
        }

        pc.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        setupDataChannel();

        pc.current.onicecandidate = event => {
            if (event.candidate) {
                const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');
                addDoc(calleeCandidatesCollection, event.candidate.toJSON());
            }
        };

        const offer = roomSnap.data().offer;
        await pc.current.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);

        await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });

        const callerCandidatesCollection = collection(roomRef, 'callerCandidates');
        onSnapshot(callerCandidatesCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.current?.addIceCandidate(candidate);
                }
            });
        });
        setRoomId(inputRoomId);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            fileToSend.current = file;
            sendFile();
        }
    };

    const sendFile = () => {
        if (!fileToSend.current || !dc.current) return;
        const file = fileToSend.current;

        const metadata: FileMetadata = { name: file.name, size: file.size, type: file.type };
        dc.current.send(JSON.stringify({ type: 'metadata', payload: metadata }));

        setProgress(prev => ({...prev, [file.name]: { transferred: 0, total: file.size, completed: false }}));
        
        let offset = 0;
        const fileReader = new FileReader();

        const readSlice = (o: number) => {
            const slice = file.slice(offset, o + CHUNK_SIZE);
            fileReader.readAsArrayBuffer(slice);
        };

        fileReader.onload = e => {
            if (!e.target?.result || !dc.current) return;
            const chunk = e.target.result as ArrayBuffer;

            try {
                if (dc.current.bufferedAmount > 65535) {
                    setTimeout(() => fileReader.onload!(e), 100);
                    return;
                }
                dc.current.send(chunk);
                offset += chunk.byteLength;
                
                setProgress(prev => ({ ...prev, [file.name]: { ...prev[file.name], transferred: offset } }));

                if (offset < file.size) {
                    readSlice(offset);
                } else {
                    dc.current.send(JSON.stringify({ type: 'eof', payload: { name: file.name } }));
                    setProgress(prev => ({ ...prev, [file.name]: { ...prev[file.name], completed: true } }));
                    toast({title: "File sent!", description: `${file.name} has been sent successfully.`})
                }
            } catch (error) {
                console.error("Failed to send chunk:", error);
                toast({ title: "Transfer Error", description: "Could not send file chunk.", variant: "destructive" });
            }
        };
        readSlice(0);
    };

    const renderHeader = () => (
        <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
                <Logo className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold font-headline">WiFi Direct</h1>
            </div>
            {appState === 'connected' && (
                <div className="flex items-center gap-2">
                    <ConnectionAssistance />
                    <Button variant="destructive" size="sm" onClick={cleanup}>Disconnect</Button>
                </div>
            )}
        </div>
    );

    const renderIdleState = () => (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>Start a transfer</CardTitle>
                <CardDescription>Create a new room or join an existing one to start transferring files.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button className="w-full" onClick={createRoom} disabled={isLoading}>Create Room</Button>
                <div className="flex items-center gap-2">
                    <Input placeholder="Enter Room ID" value={inputRoomId} onChange={e => setInputRoomId(e.target.value)} />
                    <Button variant="secondary" onClick={joinRoom} disabled={isLoading || !inputRoomId}>Join</Button>
                </div>
            </CardContent>
        </Card>
    );

    const renderCreatingState = () => (
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle>Room Created</CardTitle>
                <CardDescription>Ask the other device to join using this Room ID.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-center space-x-2 rounded-lg bg-secondary p-4">
                    <span className="text-2xl font-bold tracking-widest font-mono">{roomId}</span>
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-4">
                <div className='flex items-center text-muted-foreground gap-2'><CircleDashed className='animate-spin' /> Waiting for peer to connect...</div>
                <Button variant="outline" size="sm" onClick={cleanup}>Cancel</Button>
            </CardFooter>
        </Card>
    );

    const renderConnectedState = () => (
        <div className="w-full max-w-2xl space-y-6">
            <Card>
                <CardHeader>
                    <div className='flex justify-between items-center'>
                        <CardTitle>Transfer Files</CardTitle>
                        <span className="text-sm font-medium text-green-600 flex items-center gap-2"><CheckCircle2 size={16} /> Connected</span>
                    </div>
                    <CardDescription>You are connected to another device. Room ID: {roomId}</CardDescription>
                </CardHeader>
                <CardContent>
                    <label htmlFor="file-upload" className="w-full">
                        <div className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-secondary/50 p-8 text-center transition hover:bg-secondary">
                            <FileUp className="h-10 w-10 text-primary" />
                            <p className="mt-2 font-semibold">Click to send a file</p>
                            <p className="text-xs text-muted-foreground">Select a file to start the peer-to-peer transfer.</p>
                        </div>
                    </label>
                    <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} />
                </CardContent>
            </Card>

            <Card className={Object.keys(progress).length === 0 ? 'hidden' : ''}>
                <CardHeader>
                    <CardTitle>Transfer Progress</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {Object.entries(progress).map(([name, p]) => (
                        <div key={name} className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium truncate pr-4">{name}</span>
                                <span className="text-muted-foreground">
                                    {(p.transferred / 1024 / 1024).toFixed(2)} / {(p.total / 1024 / 1024).toFixed(2)} MB
                                </span>
                            </div>
                            <Progress value={(p.transferred / p.total) * 100} />
                            
                            {p.completed && p.url && (
                                <div className='flex items-center justify-end gap-2 pt-2'>
                                <a href={p.url} download={name}>
                                    <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" /> Download</Button>
                                </a>
                                <Button size="sm" variant="ghost" onClick={() => {
                                    setProgress(prev => {
                                        const newProgress = { ...prev };
                                        delete newProgress[name];
                                        return newProgress;
                                    });
                                }}><Trash2 className='h-4 w-4'/></Button>
                                </div>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
    
    return (
        <div className="w-full flex flex-col items-center gap-8">
            {renderHeader()}
            {appState === 'idle' && renderIdleState()}
            {appState === 'creating' && renderCreatingState()}
            {appState === 'joining' && <Card className="w-full max-w-md text-center p-8"><p className='flex items-center text-muted-foreground gap-2'><CircleDashed className='animate-spin' /> Joining room...</p></Card>}
            {appState === 'connected' && renderConnectedState()}
        </div>
    );
}
