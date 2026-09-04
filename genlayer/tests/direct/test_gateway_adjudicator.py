import json


REQUEST_ID = "0x1577cacc81cec62efd3535a95f561d9d9dd71182d3e295c13314ae29d705c671"
EVIDENCE_HASH = "0xf3a8e3766e3a518db711b5913b8761f8812ad38c38e086ab370ce49392eccb2c"
POLICY_HASH = "0x65cd8201a8fc7a96b58b9fec1de083fd733d2d1a562914d010a7186af4768f60"
ORIGIN = "0x" + "44" * 20
REQUESTER = "0x" + "55" * 20
CALLBACK = "0x" + "66" * 20


def deploy(direct_deploy, submitter):
    return direct_deploy(
        "genlayer/contracts/gateway_adjudicator.py",
        "0x" + submitter.hex(),
        ORIGIN,
        "0x" + submitter.hex(),
    )


def test_pass_result_is_persisted(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"https://evidence\.example/jobs/1",
        {"status": 200, "body": "tests: passed\ndeployment: verified"},
    )
    direct_vm.mock_llm(
        r".*decentralized work adjudicator.*",
        json.dumps({"decision": "PASS", "reason": "All mandatory checks are evidenced."}),
    )

    contract.adjudicate(
        REQUEST_ID,
        84532,
        ORIGIN,
        REQUESTER,
        CALLBACK,
        1,
        2000000000,
        "Was the work completed?",
        "Tests and deployment must pass.",
        "https://evidence.example/jobs/1",
        EVIDENCE_HASH,
        POLICY_HASH,
    )

    stored = json.loads(contract.get_result(REQUEST_ID))
    assert stored["decision"] == "PASS"
    assert stored["evidence_hash"] == EVIDENCE_HASH


def test_unauthorized_submitter_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy, direct_alice)
    direct_vm.sender = direct_bob

    with direct_vm.expect_revert("unauthorized submitter"):
        contract.adjudicate(
            REQUEST_ID,
            84532,
            ORIGIN,
            REQUESTER,
            CALLBACK,
            1,
            2000000000,
            "Question",
            "Tests and deployment must pass.",
            "https://evidence.example/jobs/1",
            EVIDENCE_HASH,
            POLICY_HASH,
        )


def test_duplicate_finalization_reverts(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"https://evidence\.example/jobs/1",
        {"status": 200, "body": "tests: passed\ndeployment: verified"},
    )
    direct_vm.mock_llm(
        r".*decentralized work adjudicator.*",
        json.dumps({"decision": "UNDETERMINED", "reason": "Evidence is incomplete."}),
    )

    args = (
        REQUEST_ID,
        84532,
        ORIGIN,
        REQUESTER,
        CALLBACK,
        1,
        2000000000,
        "Was the work completed?",
        "Tests and deployment must pass.",
        "https://evidence.example/jobs/1",
        EVIDENCE_HASH,
        POLICY_HASH,
    )
    contract.adjudicate(*args)
    with direct_vm.expect_revert("request already finalized"):
        contract.adjudicate(*args)


def test_evidence_commitment_mismatch_finalizes_fail(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"https://evidence\.example/jobs/1",
        {"status": 200, "body": "tampered evidence"},
    )

    contract.adjudicate(
        REQUEST_ID,
        84532,
        ORIGIN,
        REQUESTER,
        CALLBACK,
        1,
        2000000000,
        "Was the work completed?",
        "Tests and deployment must pass.",
        "https://evidence.example/jobs/1",
        EVIDENCE_HASH,
        POLICY_HASH,
    )
    stored = json.loads(contract.get_result(REQUEST_ID))
    assert stored["decision"] == "FAIL"


def test_unreachable_evidence_finalizes_undetermined(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.mock_web(
        r"https://evidence\.example/jobs/1",
        {"status": 503, "body": "temporarily unavailable"},
    )
    contract.adjudicate(
        REQUEST_ID,
        84532,
        ORIGIN,
        REQUESTER,
        CALLBACK,
        1,
        2000000000,
        "Was the work completed?",
        "Tests and deployment must pass.",
        "https://evidence.example/jobs/1",
        EVIDENCE_HASH,
        POLICY_HASH,
    )
    stored = json.loads(contract.get_result(REQUEST_ID))
    assert stored["decision"] == "UNDETERMINED"


def test_request_commitment_mismatch_reverts(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("request commitment mismatch"):
        contract.adjudicate(
            "0x" + "11" * 32,
            84532,
            ORIGIN,
            REQUESTER,
            CALLBACK,
            1,
            2000000000,
            "Was the work completed?",
            "Tests and deployment must pass.",
            "https://evidence.example/jobs/1",
            EVIDENCE_HASH,
            POLICY_HASH,
        )
