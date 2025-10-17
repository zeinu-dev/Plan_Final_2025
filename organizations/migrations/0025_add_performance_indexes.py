# Generated migration for performance optimization

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0024_increase_achievement_field_size'),
    ]

    operations = [
        # Add indexes for Plan model
        migrations.AddIndex(
            model_name='plan',
            index=models.Index(fields=['status'], name='plan_status_idx'),
        ),
        migrations.AddIndex(
            model_name='plan',
            index=models.Index(fields=['organization', 'status'], name='plan_org_status_idx'),
        ),
        migrations.AddIndex(
            model_name='plan',
            index=models.Index(fields=['strategic_objective'], name='plan_obj_idx'),
        ),

        # Add indexes for SubActivity model
        migrations.AddIndex(
            model_name='subactivity',
            index=models.Index(fields=['main_activity'], name='subact_mainact_idx'),
        ),
        migrations.AddIndex(
            model_name='subactivity',
            index=models.Index(fields=['activity_type'], name='subact_type_idx'),
        ),
        migrations.AddIndex(
            model_name='subactivity',
            index=models.Index(fields=['budget_calculation_type'], name='subact_budgtype_idx'),
        ),

        # Add indexes for MainActivity model
        migrations.AddIndex(
            model_name='mainactivity',
            index=models.Index(fields=['initiative'], name='mainact_init_idx'),
        ),

        # Add indexes for StrategicInitiative model
        migrations.AddIndex(
            model_name='strategicinitiative',
            index=models.Index(fields=['strategic_objective'], name='init_obj_idx'),
        ),
    ]
