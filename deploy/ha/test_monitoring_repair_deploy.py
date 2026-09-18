"""Offline safety tests for the narrow Dokploy monitoring rollout."""
import copy
import importlib.util
from pathlib import Path
import unittest

import yaml

SPEC = importlib.util.spec_from_file_location('monitoring_repair_deploy',
    Path(__file__).with_name('deploy-monitoring-repair.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeploymentScopeTests(unittest.TestCase):
    def setUp(self):
        self.new = yaml.safe_load(Path(__file__).with_name('patroni-production-rainer.yml').read_text())
        self.old = copy.deepcopy(self.new)
        for service, component in [('monitor', 'monitor'), ('alert-pusher', 'alerting')]:
            self.old['services'][service]['image'] = MODULE.PREFIX + component + '-r1'
        self.old['services']['monitor']['environment'].pop('POINTFINDER_MONITOR_EXPECTED_STANDBYS')

    def validate(self, desired):
        MODULE.validate_change(yaml.safe_dump(self.old), yaml.safe_dump(desired))

    def test_approved_change(self):
        self.validate(self.new)

    def test_idempotent(self):
        MODULE.validate_change(yaml.safe_dump(self.new), yaml.safe_dump(self.new))

    def test_reject_primary_image_change(self):
        self.new['services']['patroni-rainer']['image'] = 'different'
        with self.assertRaises(AssertionError):
            self.validate(self.new)

    def test_reject_data_volume_change(self):
        self.new['volumes']['production-data']['name'] = 'different'
        with self.assertRaises(AssertionError):
            self.validate(self.new)

    def test_reject_extra_monitor_environment(self):
        self.new['services']['monitor']['environment']['UNREVIEWED'] = 'value'
        with self.assertRaises(AssertionError):
            self.validate(self.new)

    def test_reject_wrong_expected_members(self):
        self.new['services']['monitor']['environment']['POINTFINDER_MONITOR_EXPECTED_STANDBYS'] = 'other'
        with self.assertRaises(AssertionError):
            self.validate(self.new)


if __name__ == '__main__':
    unittest.main()
