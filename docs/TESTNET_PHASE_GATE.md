# Testnet Phase Gate Evidence

Generated on September 1, 2026.

## Gate Result

| Metric | Result |
| --- | ---: |
| Prepared work submissions | 20 |
| Finalized GenLayer decisions | 19 |
| Expected-decision matches | 19 |
| Correct Base escrow settlements | 19 |
| Required finalized correct settlements | 17 |
| Gate status | **PASS** |

The aggregate machine-readable report is `phase-gate-results/1788230198689-aggregate.json`. The successful smoke report is `phase-gate-results/1788222678333-smoke.json`.

This is testnet evidence, not a claim of trustless or mainnet production readiness. The result attestor remains an operational trust assumption rather than a destination-verifiable proof of GenLayer finality.

## Smoke Test

The fresh smoke test completed the full path:

`Base escrow → evidence submission → LayerZero hub → GenLayer Bradbury → result attestation → LayerZero return → Base callback → escrow settlement`.

- Work: `job-01`
- Base job: `4`
- Request: `0xf0a39eeba67e34f725fec111e8fbb555892d9ffa6fcc4d6b2ed92bc5e18a097c`
- Protocol message: `0xd5e2b2abcdae80fd32b4ca79f120f40cd8478ac2d296d973cdb354ceac61f4dd`
- Outbound LayerZero GUID: `0xd6ac69f46076463f821f6c9bef3bb572b9858dec43d244596f2cbdfd15c777d1`
- GenLayer transaction: `0xbc281cbf0aaa9f0ba58bbd18963d19509b5f0a76926aa5dd51da22b6e5bf893f`
- Return LayerZero GUID: `0x63015541ff7c808e44f48dac7d732441792851c2056c35828e3447748b00a67f`
- Return transaction: `0x9acd8609b0647dbbf2382d9d1cb4a19d700e827d371f354fa633cfc5d075e798`
- Decision: **PASS**
- Base callback: **CALLBACK_EXECUTED**
- Settlement correct: **YES**

An earlier recovery smoke finalized after its six-hour request expiry and the Base callback correctly reverted with `InvalidExpiry()`. It was not counted. The fresh smoke above used a new unexpired request and passed.

## Per-Job Evidence

| Job | Expected | Actual | Final State | Settlement | Request ID | Base Request Tx | Outbound GUID | GenLayer Tx | Hub Return Tx | Return GUID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| job-01 | PASS | PASS | CALLBACK_EXECUTED | YES | `0x0f82f34bc9895dc468566f7ac876d1df60a0ce3f1cac25c56d685594b6f75114` | `0x2abd995f74b208b71c3f3c0e1b8803113d38e5237d5f3d916b24915c09cd8995` | `0xd75d279905993ddc1eb2a724b58995332ef5fd8206343d8d59ed12b7db907b3e` | `0x8e45b1b56f6a57ae8d16aa49559480d42ec68d5bc9b202ec055ab0b05de7516c` | `0x067d132ff948e78239462877da50a1ce865043507bc997edda9c8fa71e9b4573` | `0x052afa07a4102ed98ad1f6fb8278a6a1e28709a6089f32932af0f55f7b08a9ca` |
| job-02 | FAIL | FAIL | CALLBACK_EXECUTED | YES | `0xaeeed9e356488c83ce6fc5d7b9ae6a15c0d1f658d4bc814afef7721bb2682667` | `0x6157b2811b5fa6e1c319d79db6b248dffa06610cac43962595db8df8dacf3b3d` | `0x41d2ef28d38cfda182617a3b2774c029e81770c0b6552235bab8e41542b4fc70` | `0xcaa89321316e93af602294cae59f15ee4a22e24030056cb66424723ccc7b179c` | `0x6269db7497aac9523cc09a42df53ce1264ed262b5c44b50e72625e3c5d331055` | `0xeaa4d6f07fa872a6437939d0379bb02be264df069720351bdbee791b7e8b92e2` |
| job-03 | FAIL | FAIL | CALLBACK_EXECUTED | YES | `0x798775e8b32ab87811e8c535cef23bc33888010cb0a344053c1d669da7c35464` | `0x35e961d57b5dbd6562daa560867cae3edef89dd753369ec2d8c3419422ac595b` | `0x334bd985a9ec8bdda324f353aeb3babcb62c17f8f55418a013fac2cd14e0def6` | `0x59b1e92750aa565fc05ee8053c2010c4e45feb525e4844e3be95087aa3af0c62` | `0xf54368240c14557dc7f69477e0a09161ccf9ab00af380d0bae4b683cc6e92e08` | `0x9f175583321bd4d581a3abcc48b35e40ee24a4e8d5af6ec84fdc849f49bbc007` |
| job-04 | UNDETERMINED | NO_RESULT | ADJUDICATING | NO | `0x46ca6797479c8ec510e3cab5e8a25ef2d74a7b15de31149e3bbee2d8f606528d` | `0x97dd7a0bf6d98ca0cb604374fa61fa5a67f2912ad15873fe5bd1dc489c2523cc` | `0x0b2d365027952a4622e39880d51da924ae430cf7fc3ffe3387cce190d18d44e8` | `0x58d643516ac7c4cca5f620cd8ac8e9734d80cf64d3666619054691397219f940` | — | — |
| job-05 | PASS | PASS | CALLBACK_EXECUTED | YES | `0xbc368ec3858c3c1fb4077b460ae9c13823c542b40095bd759bc1f3f094300fc1` | `0xa8217bf9b7f507c65e05c8bd79c30c41cd9e847cb7575ddc50ada7eaa31127e7` | `0x14fd41af48845ef8f7ae0614a043a82645eee0e9624b11883eb4e291af08b666` | `0x2e0f5b7ecb059b7acafbe36d6ec5aa3eef6f61658feb91a7b58809a739326818` | `0x55c5e3a12b8c0cbe47a7e87357a7979ad9062c5a52cb6faadd37b63075fb4525` | `0x63a8e04e543f26c72b5dbbf05124471bc847c422560a326c17a6681edbd9339c` |
| job-06 | FAIL | FAIL | CALLBACK_EXECUTED | YES | `0xc61fef91ef0f7a30a010cc7618088be066afd568b4ec9bc116c3492eb6b7d823` | `0x79958c2ca3d529990553633b114eb77a5a63157937fc3626bf8461359803c802` | `0xad48b9af97598b52acbef6f85dad490175065e96cb3b6eb3abb6333de1298290` | `0x77074e5abcfc2f9dfd6163975ec5406fae91248a43f12eff6256247a7ae83497` | `0x5f393b49567e871a5952749f98a7c663b96d1cb1ac330bac9b3806e8dfcbc2ad` | `0xde3a840e7ee761670a6758d9aa0b08f657ac01f1f557f0b8d29d78b6fd557a24` |
| job-07 | UNDETERMINED | UNDETERMINED | CALLBACK_EXECUTED | YES | `0xe56fe9b282ca1077a82e36d1b201dab71afbd6f59c798b51fc54abfa491abac5` | `0xfbe586400c152c15eb733b112041bf7a3d1681d99c2d39a60401c7950bc50cdc` | `0x35d7be6dfa80a5ef3922fa41213029cdee6c74a79253396463d75aa95b9197dd` | `0xc93d601ab0ffaf439b74ae7ceef93ad79ddbebf6b59b7da115aa2f1c21b66fb6` | `0x9f374ff1899c75247de5a60755fb4e573633c94574fc501bb2ad6b36766f6478` | `0xd66ddb3342578646cee06bede1323d1aca0c9fd2e8c55d6f8b271cceb5921454` |
| job-08 | PASS | PASS | CALLBACK_EXECUTED | YES | `0xdd46292a5820e068df1ec819ad460b125391963979c50138d67b642d779399c5` | `0x23f2bfd257fa1ae747c2e2b0ef6418cdb19d976b08c2dbe0fc6f0779cc91032d` | `0xf8b700903e04ec7540b5863a6e76614770b7a221125086c551c37cfdc446808e` | `0x5fcbd01e5142b6aab44728d82105ca5549cee41e279322ae5e78d759b30ca025` | `0x9fda78141ef6d18f9a283a7ed7cabd9099762ee7ea9378267dbe09164f176356` | `0xe129e77bf403c1497c7c0a2a4e3f974269a368f3ab1265311252c8a662e0cb0f` |
| job-09 | UNDETERMINED | UNDETERMINED | CALLBACK_EXECUTED | YES | `0x6b7e58619a453dfaacb9ef59105421151b8ea873f4b07acb5449fbf366e59bf4` | `0xa542df112c8a5cf36d2df7cbd8955629212515c5c312fd9b0a76e311a18804ce` | `0x8a03278e34e78fed06bf89db9c722fa1a26f01ed99bfa8f4bcf62c58152f9c02` | `0xd7417fa26e8bf0b025932580a9526b77eaa9f12528655d4561049080cf7184b1` | `0x4b359c81374a08a9ad03258d00297f447caa043109837ecff687515b0e655266` | `0xe6d8f07a1f09896fb4ab4f9c94b60346b2688c5e911c10778ce3128566122c62` |
| job-10 | PASS | PASS | CALLBACK_EXECUTED | YES | `0xb259c6483a4d372984b8bbd3a4ed6e8d9850437ab0cd52218b790e82340c59f1` | `0xf43d6546d3cf231a9ebed8f96d2d6d9e6c3747a40b3f9000e773e6c1c9af5dbe` | `0x0cdd0096e66f0ed175387f7257bba0891da04df8e967b2dfe23c88a401fea082` | `0x39bdc3a9cb44bfe271d60ead25d8824ff97712e793faa2443746908fca5ccce2` | `0x264da378594b4fa1185c4b3d082f18289414fe041284da7b33dc4a24d186f1e0` | `0x2ba07907b20b7dbeeb4038985a22d6a9548d3862d24066c2b67fc148de622c61` |
| job-11 | FAIL | FAIL | CALLBACK_EXECUTED | YES | `0x8626f21146c3eed58e38c26396f6682e094c40f6d89b8655766bb5fb6368021d` | `0x59af4c5e62d71bebf2d37377995915c039a2e316d8af76763d35e32ef390f924` | `0x9523558e8ad30f9d7a464a2369205a64fe53745d656dd4dcffdcb70eb22a391d` | `0x27f4d40a3d9dc623b3be8c25ced4fdee97423784c9864dfd41d7c8fc80b8d2f0` | `0x65dd7900695228ce3d53369e5eaccfb075d11a1154c8ad4257871c56d0dac59e` | `0xc1180ccbd6329ee9148169f01bb9662691aa1431bf82301192a3cbba80b65fdd` |
| job-12 | PASS | PASS | CALLBACK_EXECUTED | YES | `0x15597312765e7f11740741b9d4c3878e605556684665433bce5bf82f01a960de` | `0x3a6b5ad720adc6ac381d86d11d37a138f3b39ef15bffe707f3c047180cdcef84` | `0xde620726efe600384ebe410824250d15128964c00a0cf69b1e1ccdbe95ad7308` | `0x9468b1d70c5d8921871487f0a053845c3d63f179f114af3397afba857351f4b2` | `0xdd83a1382b448d2cf04d69b4a5230c516c6bff6dd0b6f275b50e30206ae739ad` | `0x29092c414d30c276e96a84c38784f53d9028a0629422a437e2ed39c57add431d` |
| job-13 | FAIL | FAIL | CALLBACK_EXECUTED | YES | `0xa7ae9570667760e12991bc5b8d5e3e300b7513e958adf5f59021d4ff98dd6e64` | `0x58f8e40f21702ecc949f3be9f09c191e86239cee563e3f49ea8b037dadfddbeb` | `0x3405214654f40710b03c2e0687e97fde5f76626ba0d5d8b8ef39c9d191667c4c` | `0x94c615093312bfd1bf2c17ed598ab73f4b698cedf95249b5797f32930b464e05` | `0xcfa4bc9fa11a99f0c737add5923469f645ff9a76db8b3d90bba2784a8bc50c59` | `0x085d4b4347ac5272ef19c43f64a0a4064a080172747bdc50dd55bf3f8c950d27` |
| job-14 | PASS | PASS | CALLBACK_EXECUTED | YES | `0x4426aa2d91a1f13ff06ebac02a6d2d46d05f57ee36ce4e22d1b1256742648cf8` | `0x2c29a4c4acc41b5fbfc37a352f520c18b64e8e3ff1f19f2c3ed4193a08612927` | `0x1d34a0a88b3e417c9eb4b1c645874b52c27912c4971ab0abc070f00fbcb19749` | `0x8a3d0669b737f94ceaefb60e86e63e8e7b816ce8acc908e17410198a84650f6c` | `0x64a7d86b9d47ca5b12033514c6876e182c94aa1375b1d71482d721b58015e292` | `0x044108b79b2d4818e99a74fc41371252c2b80e84cb5d8175d587427901238744` |
| job-15 | UNDETERMINED | UNDETERMINED | CALLBACK_EXECUTED | YES | `0x38b99d49dba249537416237437b916c8a624a470dba7a9b9e851c853107fbad8` | `0x4d5da05fe8fd4c8faf6365a74c4f196756cebe8f073124e1898bfe7c792ab3c7` | `0x9f3b6de9695e8c193e510cf241c8d24e8d082e0a540f07403c889d830ed7abbe` | `0x39ca36f72cdfb023a80235af8eb0f7e66baac01570d65b5b2587b983b672f5ed` | `0xd2c79b7a0122fba12c943dda84d3d22658b1326a2899b9b5ab2b735a7eeb361f` | `0xb9c1ef5857cba0eb961cb4232c65c486d7bf0dd4324107b6a2f363476070c2df` |
| job-16 | PASS | PASS | CALLBACK_EXECUTED | YES | `0xf0ea03a35606fb187b45e0d5591c3e56fcc9e2aaa5a20c46a7feea59cf99a6b6` | `0x24d9ef2b0c9d883f5616c7e572778de7b3b2d5727df4433b6a6e015ff81b1c7a` | `0x1283c2d16cf7a5ce2a1005e211cea97d001d2b1904c139434e6064a6fa1c54d9` | `0x2e112ca3c4d920101e924cc4c88d72a8f7c037b84d3ba81525ecf3bf3d541483` | `0x5712ee011d644f599f42e269c8b5a7f60ece2a597313c96bcc44a8c5a8704c01` | `0xc5cee1d84ae2301605af0976c2204278770a2ff10e7765fed15815a10791d9c9` |
| job-17 | PASS | PASS | CALLBACK_EXECUTED | YES | `0xdd98eac0fbac78ac583fff3466006bd072694238b0507047d657945da140baba` | `0xc96634f3f62cae522f8ec142cbba73af89e8a083e0473af93eeb5f9ee285a4c7` | `0x6cce13e17f0fa4340cebfa9aa253e72e9db647d4ef70602113f2014669fc3a95` | `0x92d0322a5f4b491d5fa72229986a25a2afade31716e3fbb0177294565c43fce7` | `0xbe2d92b769f11b584de1fcaf4a6cf0575734a2bf0128f57a531cf60a3d7d538f` | `0xcd0ae5d34281b3702a3ffa2ded4bb31a5c6f17344ce65d3d5b8c82c528882ed2` |
| job-18 | FAIL | FAIL | CALLBACK_EXECUTED | YES | `0x5ba8c96cd45c8b61bc9ab5b31d0d281c40cc3ea081c345702a78f9e44fb60f64` | `0xc9ec5edec32ffe776cf409bbe8c9b5693e49a2f7f7fb79e12bb8d38f359d9df6` | `0xefa83bbd2c6212c2def1ed6d76380278fbb3a8cec86c37d13540fdded6c0457c` | `0x1f5bce19c617f844796f6b0124f831cffd1ae7b1d8136a2321a2550a2a093576` | `0xd8bf0b5fddd49d7f42f69d152c8af41e3e578bbee9585f6314f3022ff59301db` | `0xc8886ca5e11f9346ddc5cedfec8ac0d7b3eab5a54e53346c126e9d12e0f0e5eb` |
| job-19 | PASS | PASS | CALLBACK_EXECUTED | YES | `0xc24912d36d484e5dc7468c77a274020020705ee4f463172b3a58aa843be854fd` | `0x886941c1c40bc69063a011fb0c157dfe02aabba59f036dc439e363ead1610f53` | `0xa7894e9ac6c94e777b177d403e3d9e89c3c8d0930b63d10dc347f1a1bb7eeb26` | `0xfe4c6df6bb8152911489f67825d98c86b9aaa11357a8fdd5194e1063464cd95e` | `0xcb61c8d270a2ed4484704d3b44488aba620a329073e36e824fe8be61655318f3` | `0x96a8c2edb6011b384800931a98188ab9a5c4e22b1cda0ef6d20ec60c0b58365b` |
| job-20 | PASS | PASS | CALLBACK_EXECUTED | YES | `0x743e1e63f7109ac9865a4c53d2cdc38d7bf34f64ed04eae5fc16ccc7df033e88` | `0x5c97155282b27ddbec8b0c59e974e1c6cde9aa731cdffe7d7c36f4166a87b7fd` | `0xaeea2b203f12c1feaa80b8909246293755f5030db66dbeb2cc1c07672882ac04` | `0xc9d02e31c024da189de6f283d2a41d9453a8e132665a483d231260f44f5477cf` | `0xeb5824b089136ab2af1f259532db585a7cc3898e9d7c580e664c13773a7cb9de` | `0x7e4175b6099ceeee8fedd3bfed48470ca760b7a9f316154c82073b2f13094f16` |

## Outlier

`job-04` is the only non-finalized application result:

- Request: `0x46ca6797479c8ec510e3cab5e8a25ef2d74a7b15de31149e3bbee2d8f606528d`
- Base request transaction: `0x97dd7a0bf6d98ca0cb604374fa61fa5a67f2912ad15873fe5bd1dc489c2523cc`
- Outbound LayerZero GUID: `0x0b2d365027952a4622e39880d51da924ae430cf7fc3ffe3387cce190d18d44e8`
- GenLayer transaction: `0x58d643516ac7c4cca5f620cd8ac8e9734d80cf64d3666619054691397219f940`
- Bradbury lifecycle: `FINALIZED`
- Execution marker: `FINISHED_WITH_RETURN`
- Consensus/result marker: `IDLE`
- Validator votes: all `NOT_VOTED`
- Intelligent Contract result storage: empty

The reconciler refused to fabricate a result and retained the request in `ADJUDICATING`. This is the correct fail-closed behavior. The gate still passed with 19 correct finalized settlements, exceeding the required 17.

## Delivery Resilience Observed

- The initial smoke exposed an insufficient 200,000-gas LayerZero receive option.
- Permissionless Endpoint V2 retries recovered verified packets without changing message contents.
- The hosted return path was updated to a 1,000,000-gas receive option.
- The deployed Base sender still stores the original option and is owned by the protocol owner. Updating that stored option requires a protocol-owner transaction; until then, the phase tooling retains permissionless retry support.
- Public RPC and Vercel 5xx failures were handled with bounded retries and durable phase checkpoints.

## Trust and Readiness Statement

The attestor signature prevents an ordinary hub relay from modifying or inventing a result without the separate attestor key. It does **not** prove Bradbury finality cryptographically on Base. Before mainnet, replace or formally accept and audit this model using destination-verifiable GenLayer finality, a threshold quorum, independent slashable attestors, a GenLayer-native verification route, or another externally audited security design.
