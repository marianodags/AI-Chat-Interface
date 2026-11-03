"""Regression tests for supervised agent safety and approvals."""
import json
from pathlib import Path
from unittest.mock import patch
import pytest
from agent import Agent, AgentError

def test_rejects_traversal_and_sensitive_paths(tmp_path):
    agent=Agent(tmp_path)
    (tmp_path/'test.py').write_text('print(1)',encoding='utf-8')
    assert agent.tool('read_file', {'path':'test.py'})=='print(1)'
    for path in ('../secrets.py', '.env', '.git/config', 'secret.exe', '/etc/passwd'):
        with pytest.raises(AgentError):
            agent.tool('read_file', {'path':path})

def test_lists_without_hidden_files(tmp_path):
    agent=Agent(tmp_path)
    (tmp_path/'.env').write_text('SECRET=1')
    (tmp_path/'app.py').write_text('x=1')
    assert agent.tool('list_files', {'path':'.'})=='app.py'

def test_file_write_requires_approval(tmp_path):
    agent=Agent(tmp_path)
    calls=iter([{'tool':'write_file','args':{'path':'result.py','content':'print(42)'},
                 'reason':'Create file'},
                {'tool':'finish','args':{'message':'Done'},'reason':'Finished'}])
    with patch.object(agent,'_model',side_effect=lambda state:next(calls)):
        pending=agent.start('session-test-id-123','Create a Python file','model')
        assert pending['status']=='approval'
        assert not (tmp_path/'result.py').exists()
        denied=agent.decide('session-test-id-123',pending['pending']['id'],False)
        assert denied['status']=='done'
        assert not (tmp_path/'result.py').exists()

def test_approval_token_and_execution(tmp_path):
    agent=Agent(tmp_path)
    calls=iter([{'tool':'write_file','args':{'path':'result.py','content':'print(42)'},
                 'reason':'Create file'},
                {'tool':'finish','args':{'message':'Done'},'reason':'Finished'}])
    with patch.object(agent,'_model',side_effect=lambda state:next(calls)):
        pending=agent.start('session-test-id-456','Create a file','model')
        with pytest.raises(AgentError):
            agent.decide('session-test-id-456','invalid',True)
        finished=agent.decide('session-test-id-456',pending['pending']['id'],True)
    assert finished['status']=='done'
    assert (tmp_path/'result.py').read_text()=='print(42)'

def test_conflict_rejects_stale_file(tmp_path):
    agent=Agent(tmp_path)
    target=tmp_path/'result.py'
    target.write_text('old')
    calls=iter([{'tool':'write_file','args':{'path':'result.py','content':'new'},'reason':'Update'},
                {'tool':'finish','args':{'message':'Done'},'reason':'Finished'}])
    with patch.object(agent,'_model',side_effect=lambda state:next(calls)):
        pending=agent.start('session-test-id-789','Update','model')
        target.write_text('someone else changed this')
        result=agent.decide('session-test-id-789',pending['pending']['id'],True)
    assert target.read_text()=='someone else changed this'
    assert 'cancelled' in result['events'][-1]['result']

def test_no_implicit_shell(tmp_path):
    agent=Agent(tmp_path)
    with pytest.raises(AgentError):
        agent.tool('powershell', {'command':'Remove-Item -Recurse .'})

def test_read_only_tools_do_not_need_approval(tmp_path):
    agent=Agent(tmp_path)
    (tmp_path/'a.py').write_text('x=1')
    calls=iter([{'tool':'check_python','args':{'path':'a.py'},'reason':'Check'},
                {'tool':'finish','args':{'message':'OK'},'reason':'Finish'}])
    with patch.object(agent,'_model',side_effect=lambda state:next(calls)):
        result=agent.start('session-test-id-abc','Check syntax','model')
    assert result['status']=='done'
    assert result['events'][0]['result']=='Python syntax: OK'

def test_rejects_symlink_escape(tmp_path):
    external=tmp_path.parent/'external.py'
    external.write_text('secret')
    (tmp_path/'escape.py').symlink_to(external)
    agent=Agent(tmp_path)
    with pytest.raises(AgentError):
        agent.tool('read_file', {'path':'escape.py'})
