// import { useEffect, useRef, useState } from 'react';
// import QRCode from 'react-qr-code';
// import { BrowserQRCodeReader } from '@zxing/browser';
// import { useAuth } from '@/hooks/AuthContext';
// import { api } from '@/lib/api/api';
// import { computeSafetyNumber } from '@/lib/crypto';
// import { db } from '@/lib/db';
//
// type Tab = 'number' | 'myqr' | 'scan';
//
// type QRPayload = {
//   userId: string;
//   username: string;
//   publicKey: string;
// };
//
// export const SafetyNumberModal = ({
//   peerID,
//   peerUsername,
//   onClose,
// }: {
//   peerID: string;
//   peerUsername: string;
//   onClose: () => void;
// }) => {
//   const { myProfile } = useAuth();
//   const [tab, setTab] = useState<Tab>('number');
//
//   const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
//   const [isVerified, setIsVerified] = useState(false);
//   const [myQRData, setMyQRData] = useState<string | null>(null);
//
//   const [scanning, setScanning] = useState(false);
//   const [scanError, setScanError] = useState<string | null>(null);
//   const [scanSuccess, setScanSuccess] = useState(false);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const readerRef = useRef<BrowserQRCodeReader | null>(null);
//
//   useEffect(() => {
//     (async () => {
//       if (!myProfile) return;
//       const publicData = await db.keys.getPublicData(myProfile.id);
//
//       const myKey = publicData?.publicKey;
//       if (!myKey) return;
//
//       const number = await computeSafetyNumber(
//         myKey,
//         theirKey,
//         String(me.id),
//         peerID,
//       );
//       setSafetyNumber(number);
//       setIsVerified(!!trusted);
//
//       // QR для себя
//       // const qrPayload: QRPayload = {
//       //   userId: String(myKey.id),
//       //   username: myProfile.username,
//       //   publicKey: myKey,
//       // };
//       // setMyQRData(JSON.stringify(qrPayload));
//     })();
//   }, [peerID, myProfile]);
//
//   // Запуск сканера
//   useEffect(() => {
//     if (tab !== 'scan') return;
//
//     const reader = new BrowserQRCodeReader();
//     readerRef.current = reader;
//     setScanning(true);
//     setScanError(null);
//     setScanSuccess(false);
//
//     (async () => {
//       try {
//         const devices = await BrowserQRCodeReader.listVideoInputDevices();
//         const deviceId = devices[0]?.deviceId;
//         if (!deviceId) {
//           setScanError('No camera found');
//           return;
//         }
//
//         await reader.decodeFromVideoDevice(
//           deviceId,
//           videoRef.current!,
//           async (result, error) => {
//             if (!result) return;
//
//             if (!myProfile) return;
//
//             try {
//               const payload: QRPayload = JSON.parse(result.getText());
//
//               if (payload.userId !== peerID) {
//                 setScanError('QR belongs to a different user');
//                 return;
//               }
//
//               // await saveTrustedKey({
//               //   userId: payload.userId,
//               //   publicKey: payload.publicKey,
//               //   verifiedAt: Date.now(),
//               // });
//
//               // Пересчитываем safety number по верифицированному ключу
//               const publicData = await db.keys.getPublicData(myProfile.id);
//               const myKey = publicData?.publicKey;
//               if (myKey && myProfile) {
//                 const number = await computeSafetyNumber(
//                   myKey,
//                   payload.publicKey,
//                   String(myProfile.id),
//                   peerID,
//                 );
//                 setSafetyNumber(number);
//               }
//
//               setIsVerified(true);
//               setScanSuccess(true);
//               setScanning(false);
//             } catch {
//               setScanError('Invalid QR code');
//             }
//           },
//         );
//       } catch (e) {
//         setScanError('Camera access denied');
//         setScanning(false);
//       }
//     })();
//
//     return () => {};
//   }, [tab]);
//
//   const tabs: { id: Tab; label: string }[] = [
//     { id: 'number', label: 'safety number' },
//     { id: 'myqr', label: 'my qr' },
//     { id: 'scan', label: 'scan qr' },
//   ];
//
//   return (
//     <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70'>
//       <div className='bg-background border border-border rounded-xl w-full max-w-sm p-6 flex flex-col gap-4'>
//         {/* Header */}
//         <div className='flex items-center justify-between'>
//           <div>
//             <h3 className='text-sm font-mono'>Encryption</h3>
//             <p className='text-[10px] text-muted-foreground/60 font-mono'>
//               {peerUsername}
//             </p>
//           </div>
//           <div className='flex items-center gap-2'>
//             {isVerified && (
//               <span className='text-[10px] font-mono text-emerald-500'>
//                 ✓ verified
//               </span>
//             )}
//             <button
//               onClick={onClose}
//               className='text-muted-foreground hover:text-foreground'
//             >
//               ✕
//             </button>
//           </div>
//         </div>
//
//         {/* Tabs */}
//         <div className='flex gap-1'>
//           {tabs.map(t => (
//             <button
//               key={t.id}
//               onClick={() => setTab(t.id)}
//               className={`flex-1 py-1.5 text-[10px] font-mono rounded border transition-colors ${
//                 tab === t.id
//                   ? 'bg-secondary border-border text-foreground'
//                   : 'border-transparent text-muted-foreground/60 hover:text-muted-foreground'
//               }`}
//             >
//               {t.label}
//             </button>
//           ))}
//         </div>
//
//         {/* Safety Number */}
//         {tab === 'number' && (
//           <div className='flex flex-col gap-3'>
//             <p className='text-[11px] text-muted-foreground/60'>
//               Compare this code with your contact out-of-band. If codes differ —
//               connection may be compromised.
//             </p>
//             <div className='bg-muted rounded-lg p-4 font-mono text-sm tracking-widest text-center leading-8 select-all'>
//               {safetyNumber ?? '...'}
//             </div>
//           </div>
//         )}
//
//         {/* My QR */}
//         {tab === 'myqr' && (
//           <div className='flex flex-col items-center gap-3'>
//             <p className='text-[11px] text-muted-foreground/60 text-center'>
//               Show this QR to your contact so they can verify your key without
//               trusting the server.
//             </p>
//             {myQRData ? (
//               <div className='bg-white p-3 rounded-lg'>
//                 <QRCode value={myQRData} size={200} />
//               </div>
//             ) : (
//               <p className='text-[11px] text-muted-foreground/40 font-mono'>
//                 loading...
//               </p>
//             )}
//           </div>
//         )}
//
//         {/* Scan QR */}
//         {tab === 'scan' && (
//           <div className='flex flex-col items-center gap-3'>
//             <p className='text-[11px] text-muted-foreground/60 text-center'>
//               Scan your contact's QR code to import their key directly.
//             </p>
//
//             {scanSuccess ? (
//               <div className='text-emerald-500 font-mono text-sm text-center py-4'>
//                 ✓ key verified and saved
//               </div>
//             ) : (
//               <>
//                 <div className='relative w-full rounded-lg overflow-hidden bg-black aspect-square'>
//                   <video
//                     ref={videoRef}
//                     className='w-full h-full object-cover'
//                   />
//                   {/* Прицел */}
//                   <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
//                     <div className='w-40 h-40 border-2 border-emerald-500/60 rounded-lg' />
//                   </div>
//                 </div>
//
//                 {scanError && (
//                   <p className='text-[11px] text-red-400 font-mono'>
//                     {scanError}
//                   </p>
//                 )}
//               </>
//             )}
//           </div>
//         )}
//
//         <button
//           onClick={onClose}
//           className='mt-2 w-full py-2 text-sm border border-border rounded-lg hover:bg-muted font-mono'
//         >
//           close
//         </button>
//       </div>
//     </div>
//   );
// };
