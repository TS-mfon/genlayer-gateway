import json
import os

import pytest
from genlayer.py.keccak import Keccak256
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


def _keccak_hex(value: bytes) -> str:
    hasher = Keccak256()
    hasher.update(value)
    return "0x" + hasher.digest().hex()


def _word(value: int) -> bytes:
    return value.to_bytes(32, byteorder="big")


def _address_word(value: str) -> bytes:
    return bytes(12) + bytes.fromhex(value[2:])


def _request_id(
    origin_contract: str,
    requester: str,
    callback: str,
    nonce: int,
    expiry: int,
    question: str,
    policy: str,
    evidence_hash: str,
) -> str:
    encoded = b"".join(
        (
            _word(1),
            _word(84532),
            _address_word(origin_contract),
            _address_word(requester),
            _address_word(callback),
            _word(nonce),
            _word(expiry),
            bytes.fromhex(_keccak_hex(question.encode())[2:]),
            bytes.fromhex(_keccak_hex(policy.encode())[2:]),
            bytes.fromhex(evidence_hash[2:]),
        )
    )
    return _keccak_hex(encoded)


@pytest.mark.skipif(
    not os.getenv("RUN_GENLAYER_TESTNET_TESTS"),
    reason="Set RUN_GENLAYER_TESTNET_TESTS=1 and configure gltest before using testnet resources.",
)
def test_official_testnet_adjudication_finalizes():
    submitter = os.environ["GENLAYER_SUBMITTER_ADDRESS"]
    origin_contract = os.environ["BASE_GATEWAY_ROUTER_ADDRESS"]
    requester = os.getenv("GENLAYER_TEST_REQUESTER", "0x" + "55" * 20)
    callback = os.getenv("GENLAYER_TEST_CALLBACK", requester)
    evidence_uri = os.environ["GENLAYER_TEST_EVIDENCE_URL"]
    evidence_hash = os.environ["GENLAYER_TEST_EVIDENCE_HASH"]
    question = os.getenv(
        "GENLAYER_TEST_QUESTION",
        "Did the submitted work satisfy every mandatory requirement?",
    )
    policy = os.getenv(
        "GENLAYER_TEST_POLICY",
        "The immutable evidence must show successful tests and a verified deployment.",
    )
    nonce = int(os.getenv("GENLAYER_TEST_NONCE", "1"))
    expiry = int(os.getenv("GENLAYER_TEST_EXPIRY", "2000000000"))
    request_id = _request_id(
        origin_contract,
        requester,
        callback,
        nonce,
        expiry,
        question,
        policy,
        evidence_hash,
    )

    factory = get_contract_factory("GatewayAdjudicator")
    protocol_owner = os.getenv("GENLAYER_PROTOCOL_OWNER_ADDRESS", submitter)
    contract = factory.deploy(args=[submitter, origin_contract, protocol_owner])
    receipt = contract.adjudicate(
        args=[
            request_id,
            84532,
            origin_contract,
            requester,
            callback,
            nonce,
            expiry,
            question,
            policy,
            evidence_uri,
            evidence_hash,
            _keccak_hex(policy.encode()),
        ]
    ).transact()
    assert tx_execution_succeeded(receipt)

    stored = contract.get_result(args=[request_id]).call()
    result = json.loads(stored)
    assert result["decision"] in {"PASS", "FAIL", "UNDETERMINED"}
    assert result["request_id"] == request_id
    assert result["evidence_hash"].lower() == evidence_hash.lower()
    assert result["origin_contract"].lower() == origin_contract.lower()
